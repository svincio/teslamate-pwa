// ─────────────────────────────────────────────────────────────
// TeslaMate PWA — runtime configuration
//
// This file is loaded BEFORE the app bundle. Edit it on the
// server that hosts the PWA. End-users never see these values
// and there is no in-app UI to change them.
//
// Typical deployment: this PWA is served from the same host as
// the `tobiasehlert/teslamateapi` container, behind the same
// reverse proxy (Traefik / nginx). In that case:
//   - leave `apiBase` as the relative path "/api/v1"
//   - authentication (htpasswd / cookie) is handled by the proxy
//     and the browser sends credentials automatically
//   - no token is needed for read-only endpoints
//
// If the API lives on a different host, set `apiBase` to the
// full URL ("https://teslamate.example.com/api/v1") and make
// sure CORS is allowed for this origin.
// ─────────────────────────────────────────────────────────────

window.TMConfig = {
  // Base URL of the teslamateapi REST endpoints.
  // Same-origin (recommended):  "/api/v1"
  // Cross-origin:               "https://teslamate.example.com/api/v1"
  apiBase: "/api/v1",

  // Which car to display (TeslaMate car_id, usually 1 for single-vehicle setups).
  carId: 1,

  // Optional: API_TOKEN value (only required if you also use command/wake_up
  // endpoints AND the proxy doesn't already gate them). Leave empty otherwise.
  token: "",

  // How often to poll the API while the app is open, in seconds.
  // Set to 0 to disable auto-refresh.
  refreshSeconds: 60,

  // UI language: "auto" (Italian if the browser is Italian, English otherwise), "it" or "en".
  lang: "auto",


  // Optional: €/kWh used to estimate charge cost when TeslaMate's own cost
  // tracking isn't configured (i.e. the API returns cost: 0). Leave null to
  // just show whatever the API reports. AC = home/destination, DC = fast/Supercharger.
  priceAcPerKwh: null,
  priceDcPerKwh: null,

};
