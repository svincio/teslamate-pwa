// ─────────────────────────────────────────────────────────────
// TeslaMate PWA — API client for tobiasehlert/teslamateapi
//
// Configuration comes from window.TMConfig (loaded by config.js
// BEFORE this script). No user-facing settings, no localStorage
// URLs. Designed for same-origin deployment behind the same
// reverse proxy as the teslamateapi container.
//
// Endpoints covered:
//   GET /cars
//   GET /cars/:id
//   GET /cars/:id/status
//   GET /cars/:id/drives
//   GET /cars/:id/charges
//   GET /cars/:id/battery-health
//
// Outputs are normalized into the same shape the screens expect:
// TM_CAR, TM_DRIVES, TM_CHARGES, TM_STATS, TM_SOH_*,
// TM_ENERGY_BARS, TM_COST_LINE, TM_MONTH_*, TM_GEOFENCES.
// ─────────────────────────────────────────────────────────────

function tmReadConfig() {
  const c = (typeof window !== 'undefined' && window.TMConfig) || {};
  return {
    apiBase: String(c.apiBase || '/api/v1').replace(/\/+$/, ''),
    carId:   String(TM_PREFS.car || c.carId || 1), // the car chosen on this device wins
    token:   String(c.token || ''),
    refreshSeconds: Number.isFinite(c.refreshSeconds) ? c.refreshSeconds : 60,
    priceAcPerKwh: Number.isFinite(c.priceAcPerKwh) ? c.priceAcPerKwh : null,
    priceDcPerKwh: Number.isFinite(c.priceDcPerKwh) ? c.priceDcPerKwh : null,
    currency: String(c.currency || 'EUR').toUpperCase(),
  };
}

// ─── Low-level fetch ────────────────────────────────────────
async function tmFetch(path, { signal } = {}) {
  const cfg = tmReadConfig();
  if (!cfg.apiBase) throw new Error('NO_API_BASE');

  // Accept 'cars', '/cars', or '/api/v1/cars' — strip the prefix if present.
  let p = String(path).replace(/^\/+/, '');
  if (p.startsWith('api/v1/')) p = p.slice('api/v1/'.length);
  else if (p.startsWith('api/')) p = p.replace(/^api\//, '');

  const headers = { 'Accept': 'application/json' };
  if (cfg.token) headers['Authorization'] = 'Bearer ' + cfg.token;

  // Same-origin: browser carries proxy basic-auth / cookies automatically.
  // Cross-origin: relies on CORS + cookies if set (`include`).
  const url = `${cfg.apiBase}/${p}`;
  const sameOrigin = !/^https?:\/\//i.test(cfg.apiBase);
  const res = await fetch(url, {
    headers, signal,
    mode: sameOrigin ? 'same-origin' : 'cors',
    credentials: sameOrigin ? 'same-origin' : 'include',
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${t.slice(0, 120)}`);
  }
  const json = await res.json();
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

// ─── Helpers ────────────────────────────────────────────────
const pick = (obj, ...paths) => {
  for (const p of paths) {
    const parts = p.split('.');
    let v = obj;
    let ok = true;
    for (const k of parts) {
      if (v == null || typeof v !== 'object' || !(k in v)) { ok = false; break; }
      v = v[k];
    }
    if (ok && v != null && v !== '') return v;
  }
  return undefined;
};

const safeNum = (v, d = 0) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : d;
};

const fmtDay = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  const isYest = d.toDateString() === yest.toDateString();
  if (sameDay) return tr('Oggi');
  if (isYest) return tr('Ieri');
  return `${d.getDate()} ${MESI3[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : ''}`;
};

const fmtTime = (iso) => fmtClock(iso);

const fmtDur = (minutes) => {
  const m = Math.round(safeNum(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}min` : `${h}h`;
};

// ─── Endpoint wrappers ──────────────────────────────────────
async function loadCars()          { return await tmFetch('cars'); }
async function loadCarDetail(id)   { return await tmFetch(`cars/${id}`); }
async function loadStatus(id)      { return await tmFetch(`cars/${id}/status`); }
async function loadDrives(id, params = {}) {
  const qs = new URLSearchParams(params).toString();
  return await tmFetch(`cars/${id}/drives${qs ? '?' + qs : ''}`);
}
async function loadDriveDetail(carId, driveId) {
  const raw = await tmFetch(`cars/${carId}/drives/${driveId}`);
  // TeslamateAPI returns drive_details[] = full GPS trace (lat/lng/speed/elev/...)
  const details = pick(raw, 'drive_details')
               || pick(raw, 'drive.drive_details')
               || pick(raw, 'data.drive_details')
               || [];
  const points = (Array.isArray(details) ? details : []).map(p => ({
    lat:       safeNum(pick(p, 'latitude')),
    lng:       safeNum(pick(p, 'longitude')),
    speed:     safeNum(pick(p, 'speed')),
    power:     safeNum(pick(p, 'power')),
    elevation: safeNum(pick(p, 'elevation'), null),
    odometer:  safeNum(pick(p, 'odometer')),
    battery:   safeNum(pick(p, 'battery_level', 'usable_battery_level')),
    date:      pick(p, 'date'),
  })).filter(p => p.lat && p.lng);
  // Points without elevation (null) would plunge the chart and the climb to 0 m: carry the last known one.
  const first = points.find(p => p.elevation != null);
  let last = first ? first.elevation : 0;
  for (const p of points) { if (p.elevation == null) p.elevation = last; else last = p.elevation; }
  return { drive: raw, points };
}
async function loadCharges(id, params = {}) {
  const qs = new URLSearchParams(params).toString();
  return await tmFetch(`cars/${id}/charges${qs ? '?' + qs : ''}`);
}
async function loadBatteryHealth(id) {
  try { return await tmFetch(`cars/${id}/battery-health`); }
  catch { return null; } // added in v1.22 — may not exist on older builds
}

// ─── Units ──────────────────────────────────────────────────
// teslamateapi already converts to TeslaMate's settings (km|mi, C|F) and says which in `units`:
// the app only picks the labels. Elevation stays in metres (teslamateapi never converts it).
function tmUnits() {
  const c = window.TM_CAR || {};
  const mi = c.unitLength === 'mi';
  return { mi, dist: mi ? 'mi' : 'km', speed: mi ? 'mph' : 'km/h', eff: mi ? 'Wh/mi' : 'Wh/km',
    temp: c.unitTemp === 'F' ? '°F' : '°C', kmPer: mi ? 0.62137119223733 : 1 };
}

// ─── Normalizers ────────────────────────────────────────────
// Tesla trim badges → readable names (unknown badges are shown as-is).
const TRIMS = { '74D': 'Long Range AWD', '74': 'Long Range', '62': 'Mid Range', '50': 'Standard Range',
  'P74D': 'Performance', '57': 'Standard Range', 'P50D': 'Performance' };

// What is open, in words (car_status from teslamateapi); single doors when known, else just "doors".
function openings(cs) {
  const doors = [['driver_front_door_open', 'Porta anteriore conducente'], ['driver_rear_door_open', 'Porta posteriore conducente'],
    ['passenger_front_door_open', 'Porta anteriore passeggero'], ['passenger_rear_door_open', 'Porta posteriore passeggero']]
    .filter(([k]) => pick(cs, k) === true).map(([, l]) => tr(l));
  return [
    ...(doors.length ? doors : pick(cs, 'doors_open') === true ? [tr('Porte')] : []),
    ...(pick(cs, 'windows_open') === true ? [tr('Finestrini')] : []),
    ...(pick(cs, 'trunk_open') === true ? [tr('Bagagliaio')] : []),
    ...(pick(cs, 'frunk_open') === true ? [tr('Bagagliaio anteriore')] : []),
  ];
}

// Tyre pressures (already in TeslaMate's unit: bar or psi) with the car's own soft warnings; null when not reported.
function tyres(t, unit) {
  const out = { unit: unit === 'psi' ? 'psi' : 'bar' };
  for (const k of ['fl', 'fr', 'rl', 'rr']) {
    out[k] = { v: safeNum(pick(t, `tpms_pressure_${k}`)), warn: pick(t, `tpms_soft_warning_${k}`) === true };
  }
  return ['fl', 'fr', 'rl', 'rr'].some(k => out[k].v > 0) ? out : null;
}

function normalizeCar(carRaw, statusRaw, fallback) {
  const carObj = pick(carRaw, 'car', 'cars.0') || carRaw || {};
  const s      = pick(statusRaw, 'status') || statusRaw || {};
  const bat    = pick(s, 'battery_details') || {};
  const clim   = pick(s, 'climate_details') || {};
  const drive  = pick(s, 'driving_details', 'driving') || {};
  const charg  = pick(s, 'charging_details') || {};
  const ver    = pick(s, 'car_versions', 'car_version') || {};
  const veh    = pick(s, 'vehicle_state', 'car_details') || {};
  const geo    = pick(s, 'car_geodata') || {};
  const cstat  = pick(s, 'car_status') || {};
  const det    = pick(carRaw, 'car_details') || pick(statusRaw, 'status.car_details') || {};

  const battery = safeNum(pick(bat, 'battery_level', 'usable_battery_level'), fallback.battery);
  // Rated range = what the Tesla app shows; est_battery_range is 0 while charging.
  const range   = Math.round(safeNum(pick(bat, 'rated_battery_range_km', 'rated_battery_range')) ||
                             safeNum(pick(bat, 'est_battery_range_km', 'est_battery_range'), fallback.range));
  const shift   = String(pick(drive, 'shift_state') || '').toUpperCase();
  const plug    = !!pick(charg, 'plugged_in');
  const inMotion = shift === 'D' || shift === 'R' || safeNum(pick(drive, 'speed')) > 0;
  const tmState = String(pick(s, 'state') || '');   // online | asleep | charging | driving | offline | …
  const chargingNow = tmState === 'charging' || pick(charg, 'charging_state') === 'Charging';
  const status  = inMotion || tmState === 'driving' ? tr('In viaggio')
                : chargingNow ? tr('In carica')
                : tmState === 'offline' ? tr('Offline') : tr('Parcheggiata');

  const geofenceName = pick(geo, 'geofence');
  const address      = pick(geo, 'address');
  const location     = geofenceName
    ? (address ? `${geofenceName} · ${address}` : geofenceName)
    : (address || fallback.location);

  const name      = pick(carObj, 'name', 'car_name') || fallback.name;
  const model     = pick(carObj, 'model') || pick(det, 'model') || '';
  const trim      = pick(carObj, 'trim_badging') || pick(det, 'trim_badging') || '';
  const shortName = model ? `Model ${model}` : (name.split(' ').slice(0, 2).join(' ') || fallback.shortName);

  let vin = pick(carObj, 'vin', 'car_details.vin') || fallback.vin;
  if (vin && vin.length > 9) vin = vin.slice(0, 8) + '•••' + vin.slice(-3);

  return {
    name,
    shortName,
    battery,
    range,
    status,
    location,
    insideTemp:  Math.round(safeNum(pick(clim, 'inside_temp'),  fallback.insideTemp)),
    outsideTemp: Math.round(safeNum(pick(clim, 'outside_temp'), fallback.outsideTemp)),
    sentry:      !!pick(cstat, 'sentry_mode') || fallback.sentry,
    software:    pick(ver, 'version') || pick(veh, 'car_version') || fallback.software,
    odometer:    Math.round(safeNum(pick(s, 'odometer') ?? pick(veh, 'odometer'), fallback.odometer)),

    vin,
    trim:        TRIMS[trim] || trim,
    locked:      !!pick(cstat, 'locked'),
    open:        openings(cstat),
    tyres:       tyres(pick(s, 'tpms_details') || {}, pick(statusRaw, 'units.unit_of_pressure')),
    stateSince:  pick(s, 'state_since') || null,
    lat:         safeNum(pick(geo, 'latitude', 'location.latitude')) || null,
    lng:         safeNum(pick(geo, 'longitude', 'location.longitude')) || null,
    geofence:    geofenceName || null,
    unitLength:  pick(statusRaw, 'units.unit_of_length') || 'km',
    unitTemp:    pick(statusRaw, 'units.unit_of_temperature') || 'C',
    // Shown when plugged in; minutesToFull comes as hours from teslamateapi.
    charging: plug ? {
      active:         chargingNow,
      state:          pick(charg, 'charging_state') || '',
      powerKw:        safeNum(pick(charg, 'charger_power')),
      energyAddedKwh: safeNum(pick(charg, 'charge_energy_added')),
      currentA:       safeNum(pick(charg, 'charger_actual_current')),
      phases:         safeNum(pick(charg, 'charger_phases')),
      limitSoc:       safeNum(pick(charg, 'charge_limit_soc')) || 100,
      minutesToFull:  Math.round(safeNum(pick(charg, 'time_to_full_charge')) * 60),
    } : null,
    _raw:        { carObj, status: s },
  };
}

function normalizeDrives(driveRows) {
  const rows = pick(driveRows, 'drives') || (Array.isArray(driveRows) ? driveRows : []) || [];
  return rows.map((r, i) => {
    const startAddr = pick(r, 'starting_position.address', 'start_address.display_name', 'start_address') || '';
    const endAddr   = pick(r, 'ending_position.address',   'end_address.display_name',   'end_address')   || '';
    const startGeo  = pick(r, 'starting_position.geofence.name', 'starting_position.geofence', 'start_geofence') || '';
    const endGeo    = pick(r, 'ending_position.geofence.name',   'ending_position.geofence',   'end_geofence')   || '';

    const startDate = pick(r, 'start_date');
    const km        = safeNum(pick(r, 'odometer_details.odometer_distance', 'distance', 'distance_km'));
    const durMin    = safeNum(pick(r, 'duration_min', 'duration_minutes'));
    const kwh       = safeNum(pick(r, 'energy_consumed_net', 'consumption_kwh', 'energy_used_kwh', 'consumption.kwh'));
    // energy/distance, not consumption_net: teslamateapi converts that one wrongly to miles (×0.62 instead of ×1.61)
    const eff       = kwh && km ? Math.round((kwh * 1000) / km) : Math.round(safeNum(pick(r, 'consumption_net')));
    const avgSpeed  = Math.round(safeNum(pick(r, 'speed_avg', 'speed_avg_kmh'))) || (km && durMin ? Math.round((km / durMin) * 60) : 0);

    return {
      id:        pick(r, 'drive_id', 'id') || i + 1,
      from:      (startGeo || startAddr || '—').toString().split(',')[0],
      to:        (endGeo   || endAddr   || '—').toString().split(',')[0],
      day:       fmtDay(startDate),
      time:      fmtTime(startDate),
      km:        Math.round(km),
      dur:       fmtDur(durMin),
      kwh:       Number(kwh.toFixed(1)),
      eff,
      avgSpeed,
      distance:  km,
      durMin,
      speedMax:  Math.round(safeNum(pick(r, 'speed_max'))),
      socFrom:   Math.round(safeNum(pick(r, 'battery_details.start_battery_level', 'start_battery_level'))),
      socTo:     Math.round(safeNum(pick(r, 'battery_details.end_battery_level', 'end_battery_level'))),
      outsideTemp: pick(r, 'outside_temp_avg') != null ? Math.round(safeNum(pick(r, 'outside_temp_avg'))) : null,
      odoStart:  safeNum(pick(r, 'odometer_details.odometer_start')),
      odoEnd:    safeNum(pick(r, 'odometer_details.odometer_end')),
      _date:     startDate,
      _end:      pick(r, 'end_date'),
      _raw:      r,
    };
  });
}

function normalizeCharges(chargeRows) {
  const rows = pick(chargeRows, 'charges') || (Array.isArray(chargeRows) ? chargeRows : []) || [];
  const cfg  = tmReadConfig();

  return rows.map((r, i) => {
    const startDate = pick(r, 'start_date');
    const durMin    = safeNum(pick(r, 'duration_min', 'duration_minutes'));
    const kwh       = safeNum(pick(r, 'charge_energy_added', 'energy_added_kwh'));
    const from      = safeNum(pick(r, 'battery_details.start_battery_level', 'start_battery_level', 'start_battery'));
    const to        = safeNum(pick(r, 'battery_details.end_battery_level',   'end_battery_level',   'end_battery'));
    const apiCost   = safeNum(pick(r, 'cost', 'charge_cost'));

    const addr      = pick(r, 'address.display_name', 'address') || '';

    // teslamateapi doesn't expose fast_charger_*/charger_power on /charges — estimate
    // peak power from energy/duration and use it (plus the address text) to classify.
    const peakKw    = safeNum(pick(r, 'charger_power', 'charger_power_max')) ||
                       (durMin > 0 ? Number(((kwh / (durMin / 60))).toFixed(1)) : 0);
    const isSC      = /supercharg/i.test(addr);
    let type = 'home';
    if (isSC) type = 'sc';
    else if (peakKw >= 22) type = 'dc';

    const where = addr ? addr.split(',')[0] : (type === 'home' ? tr('Casa') : tr('Pubblico'));

    // Fall back to an estimated cost (config price × kWh) only when TeslaMate's
    // own cost tracking reports 0 — never override a real recorded cost.
    const pricePerKwh = type === 'home' ? cfg.priceAcPerKwh : cfg.priceDcPerKwh;
    const cost = apiCost || (pricePerKwh ? Number((kwh * pricePerKwh).toFixed(2)) : 0);


    return {
      id:    pick(r, 'charge_id', 'id') || i + 1,
      where,
      type,
      day:   fmtDay(startDate),
      time:  fmtTime(startDate),
      dur:   fmtDur(durMin),
      kwh:   Number(kwh.toFixed(1)),
      from:  Math.round(from),
      to:    Math.round(to),
      rate:  Number(peakKw.toFixed(1)),
      cost:  Number(cost.toFixed(2)),
      durMin,
      kwhUsed: safeNum(pick(r, 'charge_energy_used')),
      rangeAdded: Math.round(safeNum(pick(r, 'range_rated.end_range')) - safeNum(pick(r, 'range_rated.start_range'))),
      outsideTemp: pick(r, 'outside_temp_avg') != null ? Math.round(safeNum(pick(r, 'outside_temp_avg'))) : null,
      odometer: safeNum(pick(r, 'odometer')),
      lat:   safeNum(pick(r, 'latitude')) || null,
      lng:   safeNum(pick(r, 'longitude')) || null,
      pricePerKwh: apiCost && kwh ? Number((apiCost / kwh).toFixed(3)) : pricePerKwh,
      _date: startDate,
      _end:  pick(r, 'end_date'),
      _raw:  r,
    };
  });
}

// teslamateapi's /battery-health returns a single *current* snapshot, not a
// history — there is no endpoint for that. To get a real trend we derive one
// client-side from /charges: each charge session that adds >=5 kWh gives a
// usable-capacity estimate (kWh added / % SoC gained), plotted against the
// odometer reading at that charge. This mirrors what SentryNext does.
function deriveCapacityPoints(chargesN) {
  return chargesN
    .map(c => {
      const socGain = c.to - c.from;
      const odo = safeNum(pick(c._raw, 'odometer'));
      if (c.kwh < 5 || socGain <= 0 || !odo) return null;
      return { km: Math.round(odo), kwh: Number(((c.kwh / socGain) * 100).toFixed(1)), date: c._date };
    })
    .filter(Boolean)
    .sort((a, b) => a.km - b.km);
}

// Max range at 100% per charge (rated range at the end ÷ end SoC), vs odometer.
// Only charges ending >= 50% SoC: below that the extrapolation is too noisy.
function deriveRangePoints(chargesN) {
  return chargesN
    .map(c => {
      const end = safeNum(pick(c._raw, 'range_rated.end_range'));
      if (c.to < 50 || !end || !c.odometer) return null;
      return { km: Math.round(c.odometer), range: Math.round((end / c.to) * 100) };
    })
    .filter(Boolean)
    .sort((a, b) => a.km - b.km);
}

// How much of the distance driven TeslaMate actually recorded: km inside drives vs the
// odometer span covered by those same drives (gaps = drives TeslaMate missed).
function computeCoverage(drives) {
  const ds = drives.filter(d => d.odoStart && d.odoEnd);
  if (!ds.length) return null;
  const odo = Math.max(...ds.map(d => d.odoEnd)) - Math.min(...ds.map(d => d.odoStart));
  const tracked = ds.reduce((sum, d) => sum + (d.odoEnd - d.odoStart), 0);
  return { tracked: Math.round(tracked), odo: Math.round(odo), pct: odo ? Math.min(100, (tracked / odo) * 100) : 0 };
}

function normalizeUpdates(raw) {
  const rows = pick(raw, 'updates') || (Array.isArray(raw) ? raw : []);
  return rows.map(u => ({ version: pick(u, 'version') || '—', date: pick(u, 'start_date') || null }))
    .filter(u => u.version !== '—');
}

async function loadUpdates(id) {
  try { return await tmFetch(`cars/${id}/updates?show=1000`); } catch { return null; }
}

// Charge curve, fetched on demand when a charge is opened (one light request).
async function loadChargeDetail(carId, chargeId) {
  const raw = await tmFetch(`cars/${carId}/charges/${chargeId}`);
  const c = pick(raw, 'charge') || raw || {};
  const det = pick(c, 'charge_details') || [];
  const points = det.map(p => ({
    date:    pick(p, 'date'),
    soc:     safeNum(pick(p, 'battery_level')),
    powerKw: safeNum(pick(p, 'charger_details.charger_power')),
    currentA: safeNum(pick(p, 'charger_details.charger_actual_current')),
    voltage: safeNum(pick(p, 'charger_details.charger_voltage')),
    phases:  safeNum(pick(p, 'charger_details.charger_phases')),
  }));
  const fast = det.some(p => pick(p, 'fast_charger_info.fast_charger_present') === true);
  return { points, fast };
}

function normalizeBatteryHealth(raw, chargesN) {
  const snap = pick(raw, 'battery_health') || raw || {};
  const capacityKwh    = safeNum(pick(snap, 'current_capacity'));
  const capacityMaxKwh = safeNum(pick(snap, 'max_capacity'));
  const rangeKm         = Math.round(safeNum(pick(snap, 'current_range')));
  const rangeMaxKm      = Math.round(safeNum(pick(snap, 'max_range')));
  const sohPercent      = Number(safeNum(pick(snap, 'battery_health_percentage')).toFixed(1));
  return {
    soh: sohPercent || null,
    capacityKwh, capacityMaxKwh, rangeKm, rangeMaxKm,
    points: deriveCapacityPoints(chargesN),
  };
}


// ─── Client-side aggregations ──────────────────────────────
function computeStats(drives, charges, sohInfo) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const inMonth    = (iso) => iso && new Date(iso) >= monthStart;

  const mDrives  = drives.filter(d => inMonth(d._date));
  const mCharges = charges.filter(c => inMonth(c._date));
  const monthKm     = Math.round(mDrives.reduce((s, d) => s + d.km, 0));
  const monthTrips  = mDrives.length;
  const monthKwh    = Math.round(mCharges.reduce((s, c) => s + c.kwh, 0));
  const monthCharges = mCharges.length;
  const monthCost   = Number(mCharges.reduce((s, c) => s + c.cost, 0).toFixed(2));
  const totKwh      = mDrives.reduce((s, d) => s + d.kwh, 0);
  const monthEff    = monthKm ? Math.round((totKwh * 1000) / monthKm) : 0;

  const totalKwh    = charges.reduce((s, c) => s + c.kwh, 0);
  const dcCharges   = charges.filter(c => c.type === 'sc' || c.type === 'dc');
  const dcPercent   = charges.length ? Math.round((dcCharges.length / charges.length) * 100) : 0;
  const cyclesEq    = sohInfo.capacityMaxKwh ? Number((totalKwh / sohInfo.capacityMaxKwh).toFixed(1)) : 0;

  return {
    monthKm, monthTrips, monthEff,
    monthKwh, monthCharges, monthCost,
    soh:           sohInfo.soh ?? null,
    capacityKwh:   sohInfo.capacityKwh ?? 0,
    capacityMaxKwh: sohInfo.capacityMaxKwh ?? 0,
    rangeKm:       sohInfo.rangeKm ?? 0,
    rangeMaxKm:    sohInfo.rangeMaxKm ?? 0,
    totalKwh:      Math.round(totalKwh),
    dcPercent,
    cyclesEq,
  };

}

function compute14dBuckets(items, key) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const out = new Array(14).fill(0);
  for (const it of items) {
    if (!it._date) continue;
    const d = new Date(it._date); d.setHours(0, 0, 0, 0);
    const days = Math.floor((now - d) / 86400000);
    if (days >= 0 && days < 14) out[13 - days] += it[key] || 0;
  }
  return out.map(v => Number(v.toFixed(1)));
}

function compute12mSeries(drives, charges) {
  const now = new Date();
  const buckets = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const inB = (iso) => { const t = new Date(iso); return t >= d && t < next; };
    const dr = drives.filter(x => inB(x._date));
    const ch = charges.filter(x => inB(x._date));
    const km   = Math.round(dr.reduce((s, x) => s + x.km, 0));
    const kwh  = Math.round(ch.reduce((s, x) => s + x.kwh, 0));
    const cost = Math.round(ch.reduce((s, x) => s + x.cost, 0));
    const driveKwh = dr.reduce((s, x) => s + x.kwh, 0);
    const eff  = km ? Math.round((driveKwh * 1000) / km) : 0;
    buckets.push({ label: MESI3[d.getMonth()], km, kwh, cost, eff });
  }
  return {
    labels: buckets.map(b => b.label),
    km:     buckets.map(b => b.km),
    kwh:    buckets.map(b => b.kwh),
    cost:   buckets.map(b => b.cost),
    eff:    buckets.map(b => b.eff),
  };
}

function deriveGeofences(drives, charges, fallback) {
  const map = new Map();
  const touch = (name, when) => {
    if (!name) return;
    const e = map.get(name) || { name, visits: 0, last: 0 };
    e.visits++;
    if (when) {
      const t = new Date(when).getTime();
      if (t > e.last) e.last = t;
    }
    map.set(name, e);
  };
  for (const d of drives) { touch(d.from, d._date); touch(d.to, d._date); }
  for (const c of charges) { touch(c.where, c._date); }

  const arr = [...map.values()];
  if (!arr.length) return fallback;

  arr.sort((a, b) => b.visits - a.visits);
  return arr.slice(0, 12).map((g, i) => ({
    id:        i + 1,
    name:      g.name,
    type:      /casa|home|via/i.test(g.name) ? 'home' : /uffic|work|lavor/i.test(g.name) ? 'work' : 'other',
    address:   '—',
    radius:    null,
    visits:    g.visits,
    lastVisit: g.last ? fmtRelativeDay(g.last) : '—',
    icon:      /casa|home/i.test(g.name) ? '🏠' : /uffic|work/i.test(g.name) ? '💼' : '📍',
  }));
}

function fmtRelativeDay(ts) {
  const now = Date.now();
  const days = Math.floor((now - ts) / 86400000);
  if (days < 1) return tr('Oggi');
  if (days < 2) return tr('Ieri');
  if (days < 14) return tr('{n} gg fa', { n: days });
  return fmtDay(new Date(ts).toISOString());
}

// ─── Compose everything ─────────────────────────────────────
// Split in two so the dashboard shows up as soon as the (fast) /status lands,
// while the (slow) drives/charges history keeps loading in the background.
async function tmLoadCar(id) {
  const [cars, status] = await Promise.all([
    loadCars().catch(() => null),
    loadStatus(id).catch(e => e),
  ]);
  const list = pick(cars, 'cars') || [];
  const idOf = (c) => String(pick(c, 'car_id', 'id'));
  // The car chosen on this device is gone from TeslaMate: forget the choice instead of failing forever.
  if (TM_PREFS.car && list.length && !list.some(c => idOf(c) === String(id))) { tmSetPref('car', null); location.reload(); }
  if (status instanceof Error) throw status;
  const car = normalizeCar({ car: list.find(c => idOf(c) === String(id)) || null }, status, window.TM_CAR || {});
  car.cars = list.map(c => ({ id: idOf(c), name: pick(c, 'name') || `#${idOf(c)}` })); // for the car choice
  return car;
}

// Drives: last 12 months (the window every stat/chart uses) — filtering by date
// also keeps the server query small. Charges: full history, needed for the
// battery capacity trend and total kWh / equivalent cycles (~200 KB gzipped).
// `show` is huge on purpose: teslamateapi defaults to 100 rows per page.
// /battery-health can take minutes on the (1 GB RAM) server when its cache is cold:
// drives+charges are handed to onPartial as soon as they land, built with the last
// known battery snapshot, and the full history is returned once battery-health arrives.
// Start of the drives window kept in memory; older periods are fetched on demand (tmLoadDrivesRange).
function tmDrivesSince(now = new Date()) { return new Date(now.getFullYear(), now.getMonth() - 11, 1); }

// One period older than the in-memory window (Viaggi ‹). endDate is matched on the drive *end*,
// so ask one day more and let the caller filter on the start date.
async function tmLoadDrivesRange(id, from, to) {
  const end = new Date(to.getTime() + 86400000);
  return normalizeDrives(await loadDrives(id, { startDate: from.toISOString(), endDate: end.toISOString(), show: 100000 }));
}

async function tmLoadHistory(id, onPartial, lastSohRaw) {
  const now   = new Date();
  const since = tmDrivesSince(now).toISOString();
  const sohP  = loadBatteryHealth(id);
  const [drives, charges, updates] = await Promise.all([
    loadDrives(id, { startDate: since, show: 100000 }),
    loadCharges(id, { show: 100000 }),
    loadUpdates(id),
  ]);
  if (onPartial) onPartial(buildHistory(drives, charges, lastSohRaw, updates));
  const sohRaw = await sohP;
  return { ...buildHistory(drives, charges, sohRaw, updates), sohRaw };
}

function buildHistory(drives, charges, sohRaw, updates) {
  const drivesN     = normalizeDrives(drives);
  const chargesN    = normalizeCharges(charges);
  const sohInfo     = normalizeBatteryHealth(sohRaw, chargesN);
  return {
    drives: drivesN, charges: chargesN,
    stats:          computeStats(drivesN, chargesN, sohInfo),
    capacityPoints: sohInfo.points,
    energy14d:      compute14dBuckets(chargesN, 'kwh'),
    cost14d:        compute14dBuckets(chargesN, 'cost'),
    months:         compute12mSeries(drivesN, chargesN),
    geofences:      deriveGeofences(drivesN, chargesN, []),
    rangePoints:    deriveRangePoints(chargesN),
    coverage:       computeCoverage(drivesN),
    updates:        normalizeUpdates(updates),
  };
}

function applyHistory(d) {
  Object.assign(window, {
    TM_DRIVES:     d.drives,
    TM_CHARGES:    d.charges,
    TM_STATS:      d.stats,
    TM_CAPACITY_POINTS: d.capacityPoints,
    TM_ENERGY_BARS: d.energy14d,
    TM_COST_LINE:   d.cost14d,
    TM_MONTH_LABELS: d.months.labels,
    TM_MONTH_KM:    d.months.km,
    TM_MONTH_KWH:   d.months.kwh,
    TM_MONTH_COST:  d.months.cost,
    TM_MONTH_EFF:   d.months.eff,
    TM_GEOFENCES:   d.geofences,
    TM_RANGE_POINTS: d.rangePoints || [],
    TM_COVERAGE:    d.coverage || null,
    TM_UPDATES:     d.updates || [],
  });
}

// ─── Local cache (instant start) ────────────────────────────
// Last car + history are kept in localStorage so the app opens on the last known data
// while fresh data loads. _raw is dropped (only used while building; keeps it < 1 MB).
// shortcut: day labels ("Oggi"/"Ieri") and 14-day buckets are precomputed, so cached
// ones can be off by a day until the refresh lands (seconds); fine unless offline for long.
const TM_CACHE_KEY = `tm.pwa.cache.v2.${TM_LANG}.${TM_H12 ? 12 : 24}.car${tmReadConfig().carId}`; // bump when the cached shape changes; per language and clock (labels are precomputed) and per car
const stripRaw = (arr) => (arr || []).map(({ _raw, ...x }) => x);

function tmReadCache() {
  try { return JSON.parse(localStorage.getItem(TM_CACHE_KEY)) || null; } catch { return null; }
}
function tmWriteCache(patch) {
  try {
    localStorage.setItem(TM_CACHE_KEY, JSON.stringify({ ...(tmReadCache() || {}), ...patch }));
  } catch {} // quota exceeded / private mode: the cache is best-effort
}

// ─── React hook ─────────────────────────────────────────────
const HISTORY_MAX_AGE_MS = 30 * 60 * 1000;

function useTeslaMate() {
  const { useState, useEffect, useCallback, useRef } = React;
  const [state, setState] = useState(() => {
    // Start from the cached data, if any: the boot screen is skipped (dataVersion > 0).
    const c = tmReadCache();
    const ok = !!(c && c.car && c.history);
    if (ok) { window.TM_CAR = c.car; applyHistory(c.history); }
    return {
      status: 'idle',       // 'idle' | 'loading' | 'live' | 'error'  (of /status)
      historyStatus: 'idle', // same values, for drives/charges/battery-health
      error:  null,          // /status error
      historyError: null,
      lastFetch: ok ? c.carAt : 0,
      dataVersion: ok ? 1 : 0,
    };
  });
  const carBusy     = useRef(false);
  const historyBusy = useRef(false);
  const historyAt   = useRef(0);

  const loadCar = useCallback(async () => {
    if (carBusy.current) return;
    carBusy.current = true;
    setState(s => ({ ...s, status: 'loading' }));
    try {
      const car = await tmLoadCar(tmReadConfig().carId);
      // First paint before history arrives: empty-but-valid TM_* so screens don't crash.
      if (!window.TM_DRIVES) applyHistory(buildHistory([], [], null));
      window.TM_CAR = car;
      tmWriteCache({ car: { ...car, _raw: undefined }, carAt: Date.now() });
      setState(s => ({ ...s, status: 'live', error: null, lastFetch: Date.now(), dataVersion: s.dataVersion + 1 }));
    } catch (err) {
      setState(s => ({ ...s, status: 'error', error: String(err.message || err) }));
    } finally {
      carBusy.current = false;
    }
  }, []);

  const loadHistory = useCallback(async () => {
    if (historyBusy.current) return;
    historyBusy.current = true;
    setState(s => ({ ...s, historyStatus: 'loading' }));
    try {
      const lastSohRaw = (tmReadCache() || {}).sohRaw || null;
      const d = await tmLoadHistory(tmReadConfig().carId, (partial) => {
        applyHistory(partial);
        setState(s => ({ ...s, dataVersion: s.dataVersion + 1 }));
      }, lastSohRaw);
      applyHistory(d);
      tmWriteCache({
        history: { ...d, sohRaw: undefined, drives: stripRaw(d.drives), charges: stripRaw(d.charges) },
        sohRaw: d.sohRaw, historyAt: Date.now(),
      });
      historyAt.current = Date.now();
      setState(s => ({ ...s, historyStatus: 'live', historyError: null, dataVersion: s.dataVersion + 1 }));
    } catch (err) {
      setState(s => ({ ...s, historyStatus: 'error', historyError: String(err.message || err) }));
    } finally {
      historyBusy.current = false;
    }
  }, []);

  // Manual refresh / first load: both in parallel, each applied as soon as it lands.
  const refresh = useCallback(() => Promise.all([loadCar(), loadHistory()]), [loadCar, loadHistory]);

  useEffect(() => { refresh(); }, [refresh]);

  // Periodic refresh: only the cheap /status; history at most every 30 min.
  useEffect(() => {
    const secs = tmReadConfig().refreshSeconds;
    if (!secs || secs <= 0) return;
    const t = setInterval(() => {
      loadCar();
      if (Date.now() - historyAt.current > HISTORY_MAX_AGE_MS) loadHistory();
    }, secs * 1000);
    return () => clearInterval(t);
  }, [loadCar, loadHistory]);

  return { ...state, refresh };
}

// ─── Read-only diagnostics probe ────────────────────────────
async function tmProbe() {
  const cfg = tmReadConfig();
  if (!cfg.apiBase) return { ok: false, error: 'apiBase non configurato' };
  try {
    const ping = await tmFetch('cars');
    const cars = pick(ping, 'cars') || (Array.isArray(ping) ? ping : []);
    return {
      ok: true,
      carsCount: cars.length || 0,
      cars: cars.map(c => ({ id: pick(c, 'car_id', 'id'), name: pick(c, 'name', 'car_name') })),
    };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

// ─── Expose ────────────────────────────────────────────────
Object.assign(window, {
  tmReadConfig, tmUnits, tmFetch, tmLoadCar, tmLoadHistory, tmProbe, loadChargeDetail, tmDrivesSince, tmLoadDrivesRange,

  loadDriveDetail,
  useTeslaMate,
});
