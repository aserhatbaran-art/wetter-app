# Wetter-App (PWA)
Zweck: Schlanke, installierbare Wetter-Webapp für Android mit Tagesablauf, 7 und 15 Tagen; Daten von Open-Meteo (kostenlos, ohne API-Schlüssel).

## Befehle
- Starten (lokal): `python -m http.server 8080 --bind 127.0.0.1` → http://localhost:8080 (verifiziert; auch als `wetter` in `.claude/launch.json`)
- Installieren/Build/Tests/Linter: keine (reines HTML/CSS/JS, keine Abhängigkeiten)
- Icons neu erzeugen: PowerShell mit System.Drawing (Skript lag nur im Scratchpad, nicht im Repo)

## Struktur
- `index.html`: Markup, Content-Security-Policy, Such-Dialog
- `app.js`: Abruf (Open-Meteo Forecast + Geocoding), localStorage-Cache, GPS, Suche, Rendering der Ansichten
- `style.css`: Mobile-first, bewusst nur helles Design mit weißem Hintergrund (Nutzerwunsch), Farb-Tokens in `:root`
- `sw.js`: Service Worker, cacht nur die App-Hülle (stale-while-revalidate); API läuft immer übers Netz
- `manifest.webmanifest`, `icons/`: Installierbarkeit (192, 512, maskable 512)

## Konventionen
- UI-Texte und Kommentare auf Deutsch; Einheiten °C, km/h, mm; Locale `de-DE`
- Ein einziger Forecast-Aufruf (`forecast_days=16`, `timezone=auto`, `models=best_match,ecmwf_ifs`) liefert current/hourly/daily; `mergeModels()` nimmt heute+morgen von best_match, ab übermorgen ECMWF IFS (Wechsel nur um Mitternacht)
- Nicht zurück auf reines `best_match`: Es wechselt nach ~Tag 7 das Modell (ICON → andere) und erzeugte Ausreißer (Di −6 statt +6) und Mischtage
- Zeiten von Open-Meteo sind Ortszeit ohne Offset → „jetzt“ über `utc_offset_seconds` berechnen (`locNowKey`)
- DOM nur über `textContent`/`createElement`, nie `innerHTML` mit API- oder Nutzerdaten
- Koordinaten auf 2 Nachkommastellen runden (~1 km, Privatsphäre)

## Achtung
- Nach jeder Änderung an App-Dateien `CACHE` in `sw.js` hochzählen, sonst sehen installierte Geräte die alte Version. Neuer SW lädt mit `cache: 'reload'` (GitHub Pages hat `max-age=600`) und die App lädt bei `controllerchange` einmal neu
- Ändert sich Abruf/Modellwahl/Variablen: `DATA_V` in `app.js` erhöhen, damit gespeicherte Altdaten verworfen werden
- Neue externe Hosts müssen in die CSP (`connect-src`) in `index.html`
- Service Worker und GPS brauchen HTTPS (außer localhost); live über GitHub Pages: https://aserhatbaran-art.github.io/wetter-app/ (Push auf `main` = Deploy)
- Open-Meteo: kostenlos nur nicht-kommerziell; Namensnennung (CC BY 4.0) im Footer muss bleiben
- Tage 8–15 sind Trend, in der UI als `.trend` markiert
- Wettericons sind Inline-SVG aus `icon()` in `app.js` (keine Emojis); Farben über `.ic-*`-Klassen. `.wi` muss `fill/stroke: none` behalten, sonst greift der `button svg`-Stil
- Open-Meteo-Stundenwerte für Niederschlag gelten für die VORANGEHENDE Stunde (`summary()` rechnet damit)
- `svg.append()` gibt nichts zurück: SVG-Texte über `svText()` erzeugen
- Beim lokalen Testen cached der Service Worker alte Dateien: SW abmelden + Caches leeren oder hart neu laden
