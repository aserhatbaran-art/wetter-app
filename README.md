# Wetter – schlanke PWA für Android

Reine HTML/CSS/JS-App ohne Build-Schritt und ohne Abhängigkeiten (~25 KB).
Daten: [Open-Meteo](https://open-meteo.com/) – kostenlos, kein API-Schlüssel (nur nicht-kommerzielle Nutzung, CC BY 4.0, Namensnennung ist im Footer).

## Funktionen
- **Tagesablauf:** nächste 24 Stunden (Temperatur, Wetter, Regenwahrscheinlichkeit/-menge, Wind); Tipp auf einen Tag in der 7/15-Tage-Liste zeigt dessen Stundenverlauf
- **7 Tage / 15 Tage:** Min/Max mit Temperaturbalken, Regenwahrscheinlichkeit; ab Tag 8 als Trend markiert
- Standort per GPS (auf ~1 km gerundet) oder Ortssuche (Name/PLZ), zuletzt genutzte Orte
- Schnell: ein einziger API-Aufruf für alles; letzte Daten werden sofort aus dem Speicher angezeigt, neu geladen wird erst nach 10 Minuten
- Offline: App startet ohne Netz und zeigt die letzten Daten mit Hinweis
- Hell/Dunkel nach Systemeinstellung

## Lokal testen
```powershell
python -m http.server 8080 --bind 127.0.0.1
```
Dann `http://localhost:8080` öffnen.

## Aufs Handy bringen
Service Worker und GPS funktionieren nur über **HTTPS**. Kostenlose Optionen:
- **GitHub Pages:** Ordnerinhalt in ein Repo pushen → Settings → Pages → Branch `main` / Root.
- **Netlify Drop:** Ordner auf https://app.netlify.com/drop ziehen.

Auf Android in Chrome öffnen → Menü ⋮ → **„Zum Startbildschirm hinzufügen“ / „App installieren“**.

## Updates ausrollen
Nach Änderungen in `sw.js` die Konstante `CACHE` erhöhen (`wetter-v2` …). Geräte laden die neue Version im Hintergrund und zeigen sie beim nächsten Start.

## Dateien
| Datei | Zweck |
|---|---|
| `index.html` | Struktur, CSP |
| `style.css` | Layout, Hell/Dunkel |
| `app.js` | Abruf, Cache, Standort, Suche, Ansichten |
| `sw.js` | Offline-Cache der App-Hülle |
| `manifest.webmanifest`, `icons/` | Installierbarkeit |
