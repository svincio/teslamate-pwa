# TeslaMate PWA

A read-only mobile web app for your [TeslaMate](https://github.com/teslamate-org/teslamate) data:
car status, drives, charges, statistics and battery health, installable on the phone home screen.
It reads everything from [TeslaMateAPI](https://github.com/tobiasehlert/teslamateapi) and never sends
commands to the car.

> Not affiliated with Tesla, Inc. or with the TeslaMate project.

<p>
  <img src="docs/screenshots/status.png" width="200" alt="Status">
  <img src="docs/screenshots/trips.png" width="200" alt="Trips">
  <img src="docs/screenshots/trip-detail.png" width="200" alt="Trip detail with route map">
  <img src="docs/screenshots/charges.png" width="200" alt="Charges">
</p>
<p>
  <img src="docs/screenshots/charge-detail.png" width="200" alt="Charging curve">
  <img src="docs/screenshots/statistics.png" width="200" alt="Statistics">
  <img src="docs/screenshots/battery-health.png" width="200" alt="Battery health">
  <img src="docs/screenshots/status-dark.png" width="200" alt="Status, dark theme">
</p>

<sub>Screenshots taken with invented demo data.</sub>

**Languages:** English and Italian (follows the browser, or set `lang` in `config.js`). **Units:** km and € only for now.

## Requirements

- A running TeslaMate with **TeslaMateAPI**.
- The PWA must be served from the **same host** as TeslaMateAPI (`/pwa/` next to `/api/v1/`):
  no CORS and no token needed.
- **HTTPS**: browsers install a PWA and run its service worker only over HTTPS.

## ⚠️ Security

The app has **no login**. Anyone who can reach `/pwa/` and `/api/v1/` sees your car's location and
history. Keep both behind a VPN (Tailscale, WireGuard…) or an authenticating reverse proxy.
`config.js` is a public file: never put secrets in it (see `token` below).

Note: on iOS, HTTP Basic Auth works poorly with installed PWAs; a VPN is the smoothest option.

## Install (Docker)

Image: `ghcr.io/svincio/teslamate-pwa` (amd64, arm64). Example service for a TeslaMate
`docker-compose.yml` with Traefik, where TeslaMateAPI is already routed on `/api` of `${FQDN_TM}`:

```yaml
  pwa:
    image: ghcr.io/svincio/teslamate-pwa:latest
    restart: always
    # Optional: your own settings
    # volumes:
    #   - ./pwa-config.js:/usr/share/nginx/html/pwa/config.js:ro
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.pwa.rule=Host(`${FQDN_TM}`) && (Path(`/pwa`) || PathPrefix(`/pwa/`))"
      - "traefik.http.routers.pwa.entrypoints=websecure"
      - "traefik.http.routers.pwa.tls.certresolver=tmhttpchallenge"
      - "traefik.http.services.pwa.loadbalancer.server.port=80"
```

Adapt `entrypoints`, `certresolver` and any auth middleware to your setup. With another reverse
proxy (nginx, Caddy…) just forward `/pwa/` to the container's port 80 without stripping the prefix.

Then open `https://<your-host>/pwa/` on the phone and add it to the home screen
(Safari: Share → **Add to Home Screen**).

Without Docker: serve the files of this repository under `/pwa/` with any web server
(see `nginx.conf`). There is no build step.

## Configuration

Copy [`config.js`](config.js), edit it and mount it as shown above:

| Key | Default | Meaning |
|---|---|---|
| `apiBase` | `"/api/v1"` | TeslaMateAPI base URL. Keep it same-origin. |
| `carId` | `1` | TeslaMate car id |
| `token` | `""` | TeslaMateAPI `API_TOKEN`. Not needed for read-only endpoints; it would be readable by anyone. |
| `refreshSeconds` | `60` | Status polling interval while the app is open, `0` disables it |
| `lang` | `"auto"` | `"auto"` (browser language), `"it"` or `"en"` |
| `priceAcPerKwh`, `priceDcPerKwh` | `null` | €/kWh estimate when TeslaMate records no charge cost |

Better: set the cost per kWh in TeslaMate's geofences, it is then used by Grafana too.

## How it works

- `pwa.html` loads React, Babel standalone and Leaflet from unpkg (with SRI) and compiles the
  `.jsx` files in the browser.
- `api.jsx` calls TeslaMateAPI, normalizes the data and caches the last state in `localStorage`,
  so the app opens instantly with the last known data.
- `sw.js` caches the app shell; API calls always go to the network.
- Maps use standard OpenStreetMap tiles.

Third parties contacted by the browser: unpkg.com (libraries) and tile.openstreetmap.org (maps).

## Development

```bash
TM_API_HOST=teslamate.example.com node local-server.js   # http://localhost:8000/pwa.html
```

`local-server.js` serves the files and proxies `/api/v1` to your TeslaMateAPI over HTTPS.
Without a TeslaMate at hand, `TM_MOCK=1 node local-server.js` serves invented data instead
(Milan area, about two years of trips and charges, see `demo/mock-api.js`).

End-to-end tests run a real Chrome (Google Chrome or Chromium installed) against your data or the demo data:

```bash
npm install
TM_API_HOST=teslamate.example.com npm test   # your TeslaMate
TM_MOCK=1 npm test                           # demo data
node demo/screenshots.js                     # regenerates docs/screenshots/
```

When you add or rename app files, update the list in `sw.js` (and bump `CACHE`) and in the `Dockerfile`.

## License

[MIT](LICENSE)
