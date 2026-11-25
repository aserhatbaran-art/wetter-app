'use strict';

/* ---------- Konfiguration ---------- */
const API_FORECAST = 'https://api.open-meteo.com/v1/forecast';
const API_GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const STALE_MS = 10 * 60 * 1000;   // ab diesem Alter wird neu geladen
const TIMEOUT_MS = 10000;
const K = { loc: 'wx.loc', data: 'wx.data', recent: 'wx.recent', view: 'wx.view' };

const $ = (s) => document.querySelector(s);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* Speicher voll/gesperrt */ } },
};

const state = {
  loc: store.get(K.loc),          // {name, sub, lat, lon, gps}
  data: null,                     // Open-Meteo-Antwort
  fetchedAt: 0,
  offline: false,
  view: ['hours', 'd7', 'd15'].includes(store.get(K.view)) ? store.get(K.view) : 'hours',
  day: null,                      // 'YYYY-MM-DD' für Tagesablauf eines bestimmten Tages
  loading: false,
};

/* ---------- WMO-Wettercodes ---------- */
const WMO = {
  0: 'Klar', 1: 'Überwiegend klar', 2: 'Teilweise bewölkt', 3: 'Bedeckt',
  45: 'Nebel', 48: 'Reifnebel',
  51: 'Leichter Nieselregen', 53: 'Nieselregen', 55: 'Starker Nieselregen',
  56: 'Gefrierender Nieselregen', 57: 'Starker gefrierender Nieselregen',
  61: 'Leichter Regen', 63: 'Regen', 65: 'Starker Regen',
  66: 'Gefrierender Regen', 67: 'Starker gefrierender Regen',
  71: 'Leichter Schneefall', 73: 'Schneefall', 75: 'Starker Schneefall', 77: 'Schneegriesel',
  80: 'Leichte Regenschauer', 81: 'Regenschauer', 82: 'Heftige Regenschauer',
  85: 'Schneeschauer', 86: 'Starke Schneeschauer',
  95: 'Gewitter', 96: 'Gewitter mit Hagel', 99: 'Schweres Gewitter mit Hagel',
};
const SNOW = new Set([71, 73, 75, 77, 85, 86]);
const THUNDER = new Set([95, 96, 99]);
const wxText = (code) => WMO[code] || '–';

/* ---------- SVG-Wettericons ---------- */
const SVGNS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs = {}, cls) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (cls) e.setAttribute('class', cls);
  return e;
}
function svText(attrs, cls, text) { const t = sv('text', attrs, cls); t.textContent = text; return t; }
const CLOUD = 'M10 25h13a5 5 0 0 0 1-9.9 7 7 0 0 0-13.4 1.6A4.2 4.2 0 0 0 10 25z';
const MOON = 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z';

function gSun(cx, cy, r) {
  const g = sv('g');
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a);
    g.append(sv('line', { x1: cx + (r + 2) * c, y1: cy + (r + 2) * s, x2: cx + (r + 4.2) * c, y2: cy + (r + 4.2) * s }, 'ic-ray'));
  }
  g.append(sv('circle', { cx, cy, r }, 'ic-sun'));
  return g;
}
const gMoon = (tx, ty, k) => sv('path', { d: MOON, transform: `translate(${tx} ${ty}) scale(${k})` }, 'ic-moon');
const gCloud = (tx, ty, k = 1, cls = 'ic-cloud') => sv('path', { d: CLOUD, transform: `translate(${tx} ${ty}) scale(${k})` }, cls);
function gDrops(xs, y, len = 4) {
  const g = sv('g');
  xs.forEach((x, n) => {
    const yy = y + (n % 2) * 2.5;
    g.append(sv('line', { x1: x, y1: yy, x2: x - 1.4, y2: yy + len }, 'ic-drop'));
  });
  return g;
}
function gFlakes(xs, y) {
  const g = sv('g');
  xs.forEach((x, n) => g.append(sv('circle', { cx: x, cy: y + (n % 2) * 3, r: 1.6 }, 'ic-flake')));
  return g;
}

/** Erzeugt ein Wettericon als Inline-SVG (32er-Raster). */
function icon(code, isDay = 1, big = false) {
  const svg = sv('svg', { viewBox: '0 0 32 32', 'aria-hidden': 'true' }, big ? 'wi big' : 'wi');
  const night = !isDay;
  const up = (cls) => gCloud(0, -6, 1, cls);
  switch (true) {
    case code === 0:
      svg.append(night ? gMoon(4, 4, 1.05) : gSun(16, 16, 6.5));
      break;
    case code === 1:
      svg.append(night ? gMoon(2, 2, 0.95) : gSun(13, 13, 6), gCloud(9, 9, 0.68));
      break;
    case code === 2:
      svg.append(night ? gMoon(1, 0, 0.8) : gSun(11, 10, 5), gCloud(1, 1));
      break;
    case code === 3:
      svg.append(gCloud(-4, -5, 0.9, 'ic-cloud2'), gCloud(1, 1));
      break;
    case code === 45 || code === 48: {
      const g = sv('g');
      [23, 27].forEach((y, n) => g.append(sv('line', { x1: 7 + n * 3, y1: y, x2: 27 - n * 2, y2: y }, 'ic-fog')));
      svg.append(gCloud(0, -6), g);
      break;
    }
    case code === 51 || code === 53:
      svg.append(up(), gDrops([13, 20], 22, 3));
      break;
    case code === 56 || code === 57 || code === 66 || code === 67:
      svg.append(up(), gDrops([12, 22], 22), gFlakes([17], 24));
      break;
    case code === 80 || code === 81:
      if (!night) svg.append(gSun(10, 8, 4));
      svg.append(up(), gDrops([12, 17, 22], 22));
      break;
    case code === 55 || code === 61 || code === 63:
      svg.append(up(), gDrops([12, 17, 22], 22));
      break;
    case code === 65 || code === 82:
      svg.append(up('ic-cloud2'), gDrops([10, 15, 20, 25], 22, 5));
      break;
    case SNOW.has(code):
      svg.append(up(), gFlakes([11, 17, 23], 23));
      break;
    case THUNDER.has(code):
      svg.append(up('ic-cloud2'), sv('path', { d: 'M17 17l-4 7h4l-2 6 6-8h-4l2-5z' }, 'ic-bolt'));
      break;
    default:
      svg.append(gCloud(1, 1));
  }
  return svg;
}

/* ---------- Hilfsfunktionen ---------- */
const r0 = (v) => (v == null || Number.isNaN(v) ? '–' : String(Math.round(v)));
const deg = (v) => `${r0(v)}°`;
const mm1 = (v) => (v < 10 ? v.toFixed(1).replace('.', ',') : String(Math.round(v)));
const mmTot = (v) => (v < 1 ? v.toFixed(1).replace('.', ',') : String(Math.round(v)));
const fmtTime = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const fmtStamp = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtWd = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const fmtDm = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
const fmtLong = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const hhmm = (iso) => (iso ? iso.slice(11, 16) : '–');
/** Stunde aus ISO-Zeit; back=1 liefert den Beginn des vorangehenden Stundenintervalls. */
const hourOf = (iso, back = 0) => (Number(iso.slice(11, 13)) - back + 24) % 24;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** Aktuelle Ortszeit des Standorts als 'YYYY-MM-DDTHH' (Open-Meteo liefert Ortszeit ohne Offset). */
function locNowKey(d) {
  return new Date(Date.now() + (d.utc_offset_seconds || 0) * 1000).toISOString().slice(0, 13);
}
function nowHourIndex(d) {
  const key = locNowKey(d);
  const t = d.hourly.time;
  const i = t.findIndex((x) => x.slice(0, 13) >= key);
  return i < 0 ? t.length - 1 : i;
}
function todayIndex(d) {
  const i = d.daily.time.indexOf(locNowKey(d).slice(0, 10));
  return i < 0 ? 0 : i;
}
function dayLabel(d, iso) {
  const today = locNowKey(d).slice(0, 10);
  const tomorrow = new Date(parseDay(today).getTime() + 86400000);
  if (iso === today) return 'Heute';
  if (parseDay(iso).getTime() === tomorrow.getTime()) return 'Morgen';
  return fmtWd.format(parseDay(iso)).replace('.', '');
}

/* ---------- Netzwerk ---------- */
async function getJSON(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchForecast(loc) {
  const p = new URLSearchParams({
    latitude: loc.lat, longitude: loc.lon, timezone: 'auto', forecast_days: '16',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,is_day',
    hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset',
  });
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const d = await getJSON(`${API_FORECAST}?${p}`);
      if (!Array.isArray(d?.hourly?.time) || !Array.isArray(d?.daily?.time) || !d.current) throw new Error('Ungültige Antwort');
      return d;
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await new Promise((res) => setTimeout(res, 800));
    }
  }
  throw lastErr;
}

const sameLoc = (a, b) => a && b && a.lat === b.lat && a.lon === b.lon;

async function refresh(force = false) {
  if (!state.loc || state.loading) return;
  if (!force && state.data && Date.now() - state.fetchedAt < STALE_MS) return;
  state.loading = true;
  $('#btn-refresh').classList.add('spin');
  if (!state.data) setStatus('Lade Wetterdaten …');
  const loc = state.loc;
  try {
    const d = await fetchForecast(loc);
    if (!sameLoc(loc, state.loc)) return; // Ort wurde inzwischen gewechselt
    state.data = d;
    state.fetchedAt = Date.now();
    state.offline = false;
    store.set(K.data, { loc, fetchedAt: state.fetchedAt, data: d });
    render();
  } catch {
    state.offline = true;
    if (state.data) render();
    else setStatus('Wetterdaten nicht erreichbar. Bitte Verbindung prüfen und erneut versuchen.', true);
  } finally {
    state.loading = false;
    $('#btn-refresh').classList.remove('spin');
  }
}

/* ---------- Standort ---------- */
const round2 = (v) => Math.round(v * 100) / 100; // ~1 km: genügt fürs Wetter, schont Privatsphäre

function setLoc(loc) {
  const changed = !sameLoc(loc, state.loc);
  state.loc = loc;
  store.set(K.loc, loc);
  if (!loc.gps) addRecent(loc);
  if (changed) { state.data = null; state.fetchedAt = 0; state.day = null; }
  render();
  refresh(true);
}

function locate({ silent = false } = {}) {
  if (!('geolocation' in navigator)) {
    if (!silent) setStatus('Standortbestimmung wird nicht unterstützt. Bitte Ort suchen.', true);
    return;
  }
  if (!silent) setStatus('Standort wird bestimmt …');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const loc = { name: 'Mein Standort', sub: '', lat: round2(pos.coords.latitude), lon: round2(pos.coords.longitude), gps: true };
      if (silent && sameLoc(loc, state.loc)) return;
      setLoc(loc);
    },
    (err) => {
      if (silent) return;
      setStatus(err.code === 1
        ? 'Standortzugriff verweigert. Bitte in den Browser-Einstellungen erlauben oder Ort suchen.'
        : 'Standort konnte nicht ermittelt werden. Bitte Ort suchen.', true);
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 15 * 60 * 1000 },
  );
}

/** Bei GPS-Standort still nachführen, aber nur wenn die Berechtigung schon erteilt ist (kein Dialog beim Start). */
async function trackGps() {
  if (!state.loc?.gps || !navigator.permissions) return;
  try {
    const p = await navigator.permissions.query({ name: 'geolocation' });
    if (p.state === 'granted') locate({ silent: true });
  } catch { /* nicht unterstützt */ }
}

function addRecent(loc) {
  const list = (store.get(K.recent) || []).filter((x) => !sameLoc(x, loc));
  list.unshift({ name: loc.name, sub: loc.sub, lat: loc.lat, lon: loc.lon });
  store.set(K.recent, list.slice(0, 6));
}

/* ---------- Zusammenfassung in Klartext ---------- */
// Open-Meteo: Niederschlag und -wahrscheinlichkeit beziehen sich auf die VORANGEHENDE Stunde.
function wetAt(h, i) {
  const mm = h.precipitation?.[i] ?? 0;
  const p = h.precipitation_probability?.[i];
  return mm >= 0.1 && (p == null || p >= 30);
}
function precipKind(h, is) {
  if (is.some((i) => THUNDER.has(h.weather_code[i]))) return 'Gewitter';
  if (is.some((i) => SNOW.has(h.weather_code[i]))) return 'Schnee';
  return 'Regen';
}

function summary(d, idx, dayMode) {
  const h = d.hourly;
  const parts = [];
  const wet = idx.filter((i) => wetAt(h, i));

  // Niederschlag mit geringer Wahrscheinlichkeit (typisch für spätere Tage) nicht als „trocken“ verschweigen.
  const maybe = idx.filter((i) => (h.precipitation?.[i] ?? 0) >= 0.1);
  if (!wet.length && maybe.length) {
    const total = maybe.reduce((a, i) => a + (h.precipitation[i] || 0), 0);
    const amt = total >= 0.3 ? ` (ca. ${mmTot(total)} mm)` : '';
    const k = precipKind(h, maybe);
    parts.push(`Überwiegend trocken, zeitweise ${k === 'Gewitter' ? 'Gewitter' : 'leichter ' + k} möglich${amt}.`);
  } else if (!wet.length) {
    parts.push(dayMode ? 'Den ganzen Tag trocken.' : 'Die nächsten 24 Stunden bleibt es trocken.');
  } else {
    const kind = precipKind(h, wet);
    const total = wet.reduce((a, i) => a + (h.precipitation[i] || 0), 0);
    const amt = total >= 0.3 ? ` (ca. ${mmTot(total)} mm)` : '';
    const a = idx.indexOf(wet[0]);
    let b = a;
    while (b + 1 < idx.length && wetAt(h, idx[b + 1])) b++;
    const more = wet.length > b - a + 1 ? ', später erneut' : '';
    const startH = hourOf(h.time[idx[a]], 1);
    const endH = hourOf(h.time[idx[b]]);
    if (a === 0 && b === idx.length - 1) parts.push(dayMode ? `Den ganzen Tag ${kind}${amt}.` : `${kind} hält an${amt}.`);
    else if (a === 0) parts.push(`${kind} bis etwa ${endH} Uhr${more}${amt}.`);
    else if (dayMode) parts.push(`${kind} etwa ${startH}–${endH} Uhr${more}${amt}.`);
    else parts.push(`Trocken bis etwa ${startH} Uhr, dann ${kind}${more}${amt}.`);

    const wetTemps = wet.map((i) => h.temperature_2m[i]).filter((v) => v != null);
    if (kind !== 'Schnee' && wetTemps.length && Math.min(...wetTemps) <= 1) parts.push('Glättegefahr möglich.');
  }

  const gust = Math.max(...idx.map((i) => h.wind_gusts_10m?.[i] ?? 0));
  if (gust >= 60) parts.push(`Sturmböen bis ${r0(gust)} km/h.`);
  else if (gust >= 45) parts.push(`Windböen bis ${r0(gust)} km/h.`);

  if (!dayMode) {
    const ti = todayIndex(d);
    const mx = d.daily.temperature_2m_max;
    if (mx[ti] != null && mx[ti + 1] != null) {
      const diff = Math.round(mx[ti + 1] - mx[ti]);
      if (Math.abs(diff) >= 3) parts.push(`Morgen ${Math.abs(diff)}° ${diff > 0 ? 'wärmer' : 'kälter'} als heute.`);
    }
  }
  return parts.join(' ');
}

/* ---------- Diagramm ---------- */
function chart(d, idx, dayMode) {
  const h = d.hourly;
  const n = idx.length;
  const mms = idx.map((i) => h.precipitation?.[i] ?? 0);
  const rain = mms.some((v) => v >= 0.1);
  // Ohne Niederschlag entfällt die Balkenzone, das Diagramm wird flacher.
  const W = 360, pl = 8, pr = 8, tTop = 28, tBot = 94, pTop = 108, pBot = rain ? 142 : 104, H = pBot + 30;
  const cw = (W - pl - pr) / n;
  const X = (k) => pl + (k + 0.5) * cw;

  const temps = idx.map((i) => h.temperature_2m[i]);
  const valid = temps.filter((v) => v != null);
  const tmin = Math.min(...valid), tmax = Math.max(...valid);
  const range = Math.max(tmax - tmin, 4);
  const lo = (tmin + tmax) / 2 - range / 2;
  const Y = (v) => tBot - ((v - lo) / range) * (tBot - tTop);

  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' }, 'chart');
  svg.setAttribute('aria-label', `Temperaturverlauf zwischen ${deg(tmin)} und ${deg(tmax)}`);

  // Nachtstunden hinterlegen
  for (let k = 0; k < n;) {
    if (h.is_day[idx[k]]) { k++; continue; }
    let e = k;
    while (e + 1 < n && !h.is_day[idx[e + 1]]) e++;
    svg.append(sv('rect', { x: pl + k * cw, y: 0, width: (e - k + 1) * cw, height: pBot, rx: 4 }, 'ch-night'));
    k = e + 1;
  }

  // Niederschlagsbalken (mm), blass bei geringer Wahrscheinlichkeit
  const pmax = Math.max(2, ...mms);
  if (rain) svg.append(svText({ x: pl + 2, y: pTop - 3 }, 'ch-lbl', `Niederschlag (max. ${mm1(Math.max(...mms))} mm/h)`));
  mms.forEach((v, k) => {
    if (v < 0.1) return;
    const bh = Math.max(2, (v / pmax) * (pBot - pTop));
    const prob = h.precipitation_probability?.[idx[k]];
    svg.append(sv('rect', { x: X(k) - cw * 0.34, y: pBot - bh, width: cw * 0.68, height: bh, rx: 1.5 },
      prob != null && prob < 40 ? 'ch-bar low' : 'ch-bar'));
  });
  svg.append(sv('line', { x1: pl, y1: pBot + 0.5, x2: W - pr, y2: pBot + 0.5 }, 'ch-axis'));

  // Temperaturlinie
  let path = '', pen = false;
  temps.forEach((v, k) => {
    if (v == null) { pen = false; return; }
    path += `${pen ? 'L' : 'M'}${X(k).toFixed(1)} ${Y(v).toFixed(1)}`;
    pen = true;
  });
  svg.append(sv('path', { d: path }, 'ch-line'));

  // Beschriftung alle 3 Stunden
  temps.forEach((v, k) => {
    if (k % 3 !== 0) return;
    if (v != null) {
      svg.append(sv('circle', { cx: X(k), cy: Y(v), r: 2.6 }, 'ch-dot'));
      svg.append(svText({ x: X(k), y: Y(v) - 7 }, 'ch-t', deg(v)));
    }
    const lbl = k === 0 && !dayMode ? 'Jetzt' : hhmm(h.time[idx[k]]);
    svg.append(svText({ x: X(k), y: H - 8 }, 'ch-x', lbl));
  });

  const wrap = el('div', 'chart-wrap');
  wrap.append(svg);
  return wrap;
}

/* ---------- Rendering ---------- */
function setStatus(text, warn = false) {
  const s = $('#status');
  s.textContent = text;
  s.classList.toggle('warn', warn);
}

function render() {
  const has = !!state.loc;
  $('#empty').hidden = has;
  $('#place-name').textContent = has ? state.loc.name : 'Ort wählen';
  const d = state.data;
  $('#now').hidden = !d;
  $('#tabs').hidden = !d;
  if (!d) { $('#panel').replaceChildren(); return; }

  renderCurrent(d);
  const stamp = fmtStamp.format(new Date(state.fetchedAt));
  if (state.offline) setStatus(`Offline – zeige Daten vom ${stamp}`, true);
  else setStatus(`Aktualisiert ${fmtTime.format(new Date(state.fetchedAt))}${state.loc.sub ? ' · ' + state.loc.sub : ''}`);

  document.querySelectorAll('.tabs button').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.view === state.view));
  });
  if (state.view === 'hours') renderHours(d);
  else renderDays(d, state.view === 'd7' ? 7 : 15);
}

function renderCurrent(d) {
  const c = d.current;
  const ti = todayIndex(d);
  $('#cur-icon').replaceChildren(icon(c.weather_code, c.is_day, true));
  $('#cur-temp').textContent = deg(c.temperature_2m);
  $('#cur-text').textContent = `${wxText(c.weather_code)} · ${deg(d.daily.temperature_2m_max[ti])} / ${deg(d.daily.temperature_2m_min[ti])}`;
  $('#cur-meta').textContent =
    `Gefühlt ${deg(c.apparent_temperature)} · Wind ${r0(c.wind_speed_10m)} km/h` +
    (c.wind_gusts_10m >= 40 ? ` (Böen ${r0(c.wind_gusts_10m)})` : '') +
    ` · Feuchte ${r0(c.relative_humidity_2m)} %`;
}

function precipText(prob, mm) {
  const parts = [];
  const wetMm = mm != null && mm >= 0.1;
  if (prob != null && (prob >= 20 || (wetMm && prob > 0))) parts.push(`${Math.round(prob)} %`);
  if (wetMm) parts.push(`${mm1(mm)} mm`);
  return parts.join(' · ');
}

function renderHours(d) {
  const h = d.hourly;
  let start, title, sub = '';
  if (state.day) {
    start = h.time.findIndex((t) => t.startsWith(state.day));
    const di = d.daily.time.indexOf(state.day);
    title = fmtLong.format(parseDay(state.day));
    if (di >= 0) sub = `Sonne ${hhmm(d.daily.sunrise[di])} – ${hhmm(d.daily.sunset[di])}`;
  } else {
    start = nowHourIndex(d);
    title = 'Nächste 24 Stunden';
    const ti = todayIndex(d);
    sub = `Sonne ${hhmm(d.daily.sunrise[ti])} – ${hhmm(d.daily.sunset[ti])}`;
  }
  const idx = [];
  for (let i = Math.max(start, 0); start >= 0 && i < Math.min(start + 24, h.time.length); i++) idx.push(i);

  const head = el('div', 'panel-head');
  const ht = el('div');
  ht.append(el('h2', null, title), el('small', null, sub));
  head.append(ht);
  if (state.day) {
    const back = el('button', 'chip', 'Jetzt');
    back.type = 'button';
    back.addEventListener('click', () => { state.day = null; render(); });
    head.append(back);
  }

  if (!idx.length) {
    $('#panel').replaceChildren(head, el('p', 'note', 'Keine Stundenwerte für diesen Tag.'));
    return;
  }

  const ul = el('ul', 'list');
  let lastDate = null;
  idx.forEach((i, k) => {
    const date = h.time[i].slice(0, 10);
    if (!state.day && lastDate && date !== lastDate) ul.append(el('li', 'sep', `${dayLabel(d, date)}, ${fmtDm.format(parseDay(date))}`));
    lastDate = date;
    const li = el('li', 'hour');
    li.setAttribute('aria-label', `${hhmm(h.time[i])} Uhr, ${wxText(h.weather_code[i])}, ${deg(h.temperature_2m[i])}`);
    const ic = el('span', 'i');
    ic.append(icon(h.weather_code[i], h.is_day[i]));
    li.append(
      el('span', 't', k === 0 && !state.day ? 'Jetzt' : hhmm(h.time[i])),
      ic,
      el('span', 'tmp', deg(h.temperature_2m[i])),
      el('span', 'p', precipText(h.precipitation_probability?.[i], h.precipitation?.[i])),
      el('span', 'w', `${r0(h.wind_speed_10m[i])} km/h`),
    );
    ul.append(li);
  });

  $('#panel').replaceChildren(head, el('p', 'summary', summary(d, idx, !!state.day)), chart(d, idx, !!state.day), ul);
}

function renderDays(d, n) {
  const dl = d.daily;
  const from = todayIndex(d);
  const to = Math.min(from + n, dl.time.length);
  let lo = Infinity, hi = -Infinity;
  for (let i = from; i < to; i++) {
    if (dl.temperature_2m_min[i] != null) lo = Math.min(lo, dl.temperature_2m_min[i]);
    if (dl.temperature_2m_max[i] != null) hi = Math.max(hi, dl.temperature_2m_max[i]);
  }
  const span = Math.max(hi - lo, 1);

  const out = [];
  const head = el('div', 'panel-head');
  head.append(el('h2', null, `${to - from} Tage`), el('small', null, 'Tippen für Tagesablauf'));
  out.push(head);
  if (n > 7) out.push(el('p', 'note', 'Ab Tag 8 ist die Vorhersage nur ein Trend und deutlich unsicherer.'));

  const ul = el('ul', 'list');
  for (let i = from; i < to; i++) {
    const iso = dl.time[i];
    const mn = dl.temperature_2m_min[i], mx = dl.temperature_2m_max[i];
    const prob = dl.precipitation_probability_max?.[i];
    const sum = dl.precipitation_sum?.[i] ?? 0;
    const btn = el('button', 'day' + (i - from >= 7 ? ' trend' : ''));
    btn.type = 'button';
    btn.setAttribute('aria-label', `${fmtLong.format(parseDay(iso))}: ${wxText(dl.weather_code[i])}, ${deg(mn)} bis ${deg(mx)}` +
      (sum >= 0.1 ? `, ${mm1(sum)} mm Niederschlag` : ''));

    const dd = el('span', 'd', dayLabel(d, iso));
    dd.append(el('small', null, fmtDm.format(parseDay(iso))));
    const ic = el('span', 'i');
    ic.append(icon(dl.weather_code[i]));
    const p = el('span', 'p');
    if (sum >= 0.1 || (prob ?? 0) >= 20) {
      p.textContent = prob != null ? `${Math.round(prob)} %` : '';
      if (sum >= 0.1) p.append(el('small', null, `${mm1(sum)} mm`));
    }
    const bar = el('span', 'bar');
    const fill = el('span');
    if (mn != null && mx != null) {
      fill.style.left = `${((mn - lo) / span) * 100}%`;
      fill.style.width = `${((mx - mn) / span) * 100}%`;
    }
    bar.append(fill);
    btn.append(dd, ic, p, el('span', 'lo', deg(mn)), bar, el('span', 'hi', deg(mx)));
    btn.addEventListener('click', () => {
      state.day = i === from ? null : iso;
      setView('hours');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    const li = el('li');
    li.append(btn);
    ul.append(li);
  }
  out.push(ul);
  $('#panel').replaceChildren(...out);
}

function setView(v) {
  state.view = v;
  store.set(K.view, v);
  render();
}

/* ---------- Suche ---------- */
let searchSeq = 0;
let searchTimer = 0;

function openSearch() {
  const dlg = $('#search');
  $('#search-input').value = '';
  showRecent();
  if (!dlg.open) dlg.showModal();
  setTimeout(() => $('#search-input').focus(), 50);
}
function closeSearch() { const dlg = $('#search'); if (dlg.open) dlg.close(); }

function resultItem(loc) {
  const li = el('li');
  const b = el('button', 'res', loc.name);
  b.type = 'button';
  if (loc.sub) b.append(el('small', null, loc.sub));
  b.addEventListener('click', () => { closeSearch(); setLoc({ ...loc, gps: false }); });
  li.append(b);
  return li;
}

function showRecent() {
  const recent = store.get(K.recent) || [];
  $('#search-hint').textContent = recent.length ? 'Zuletzt verwendet' : '';
  $('#search-results').replaceChildren(...recent.map(resultItem));
}

async function doSearch(q) {
  const seq = ++searchSeq;
  if (q.length < 2) { showRecent(); return; }
  $('#search-hint').textContent = 'Suche …';
  try {
    const p = new URLSearchParams({ name: q, count: '10', language: 'de', format: 'json' });
    const res = await getJSON(`${API_GEO}?${p}`);
    if (seq !== searchSeq) return;
    const items = (res.results || [])
      .filter((x) => Number.isFinite(x.latitude) && Number.isFinite(x.longitude))
      .map((x) => ({
        name: String(x.name || ''),
        sub: [x.admin1, x.country].filter(Boolean).map(String).join(', '),
        lat: round2(x.latitude),
        lon: round2(x.longitude),
      }));
    $('#search-hint').textContent = items.length ? '' : 'Kein Ort gefunden.';
    $('#search-results').replaceChildren(...items.map(resultItem));
  } catch {
    if (seq === searchSeq) $('#search-hint').textContent = 'Suche nicht möglich – offline?';
  }
}

/* ---------- Start ---------- */
function init() {
  const cached = store.get(K.data);
  if (cached && state.loc && sameLoc(cached.loc, state.loc) && cached.data?.hourly) {
    state.data = cached.data;
    state.fetchedAt = cached.fetchedAt || 0;
  }

  $('.empty-icon').replaceChildren(icon(2, 1, true));
  $('#btn-place').addEventListener('click', openSearch);
  $('#btn-locate').addEventListener('click', () => locate());
  $('#btn-refresh').addEventListener('click', () => refresh(true));
  $('#empty-locate').addEventListener('click', () => locate());
  $('#empty-search').addEventListener('click', openSearch);
  $('#search-close').addEventListener('click', closeSearch);
  $('#search-locate').addEventListener('click', () => { closeSearch(); locate(); });
  $('#search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    searchTimer = setTimeout(() => doSearch(q), 300);
  });
  document.querySelectorAll('.tabs button').forEach((b) =>
    b.addEventListener('click', () => { if (b.dataset.view !== 'hours') state.day = null; setView(b.dataset.view); }));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { refresh(); trackGps(); }
  });
  window.addEventListener('online', () => refresh(true));

  render();
  refresh();
  trackGps();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
}

init();
