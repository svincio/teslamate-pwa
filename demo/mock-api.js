// Fake TeslaMateAPI for screenshots and offline development: `TM_MOCK=1 node local-server.js`.
// Everything is invented (Milan area), deterministic (seeded) and anchored to today, same JSON shapes
// as tobiasehlert/teslamateapi v1 for the endpoints the app uses.
'use strict';

function rng(seed) { // mulberry32
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const P = {
  home:   { name: 'Home', lat: 45.4781, lng: 9.2270, elev: 122 },
  office: { name: 'Office', lat: 45.4840, lng: 9.1900, elev: 125 },
  duomo:  { name: 'Piazza del Duomo, Milano', lat: 45.4642, lng: 9.1900, elev: 120 },
  navigli:{ name: 'Alzaia Naviglio Grande, Milano', lat: 45.4520, lng: 9.1750, elev: 115 },
  gym:    { name: 'Via Tortona, Milano', lat: 45.4545, lng: 9.1650, elev: 116 },
  market: { name: 'Viale Monza, Milano', lat: 45.5050, lng: 9.2230, elev: 135 },
  linate: { name: 'Aeroporto di Linate, Segrate', lat: 45.4520, lng: 9.2780, elev: 108 },
  como:   { name: 'Piazza Cavour, Como', lat: 45.8115, lng: 9.0830, elev: 201 },
  bergamo:{ name: 'Città Alta, Bergamo', lat: 45.7037, lng: 9.6623, elev: 366 },
  torino: { name: 'Piazza San Carlo, Torino', lat: 45.0677, lng: 7.6827, elev: 239 },
  scEast: { name: 'Tesla Supercharger Assago, Milano', lat: 45.4065, lng: 9.1460, elev: 112 },
  scWest: { name: 'Tesla Supercharger Novara', lat: 45.4370, lng: 8.6330, elev: 155 },
};
const CAPACITY0 = 75, RANGE0 = 491;      // new battery: kWh, rated km at 100%
const DAY = 86400000;

function hav(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const round = (v, d = 0) => Number(v.toFixed(d));
const iso = (ms) => new Date(ms).toISOString();

function build(now = Date.now(), seed = 42, odo0 = 24300) {
  const R = rng(seed);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const start = today.getTime() - 850 * DAY; // ~28 months: periods older than 12 months are fetched on demand
  let odo = odo0, soc = 78;
  const drives = [], charges = [];
  const health = (km) => 1 - 0.045 * Math.min(1, (km - 20000) / 40000); // slow fade with distance
  const tempAt = (ms) => {
    const doy = (new Date(ms) - new Date(new Date(ms).getFullYear(), 0, 0)) / DAY;
    return 14.5 - 11 * Math.cos((2 * Math.PI * (doy - 20)) / 365) + (R() - 0.5) * 6;
  };

  function drive(from, to, at, highway) {
    const km = hav(from, to) * (highway ? 1.22 : 1.38) + 0.3;
    const avg = highway ? 62 + R() * 60 : 16 + R() * 38;
    const min = Math.max(4, Math.round((km / avg) * 60));
    const temp = tempAt(at);
    const eff = 132 + 2.6 * Math.max(0, 16 - temp) + 0.9 * Math.max(0, avg - 55) + (R() - 0.4) * 22;
    const kwh = (km * eff) / 1000;
    const cap = CAPACITY0 * health(odo);
    const socFrom = soc; soc = Math.max(5, soc - (kwh / cap) * 100);
    const kmPerPct = (RANGE0 * health(odo)) / 100;
    drives.push({
      drive_id: drives.length + 1, start_date: iso(at), end_date: iso(at + min * 60000),
      start_address: from.name, end_address: to.name,
      odometer_details: { odometer_start: round(odo, 1), odometer_end: round(odo + km, 1), odometer_distance: round(km, 1) },
      duration_min: min, duration_str: `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`,
      speed_max: Math.round(avg * (highway ? 1.35 : 1.9)), speed_avg: round(avg, 1),
      power_max: Math.round(60 + R() * 120), power_min: -Math.round(20 + R() * 40),
      battery_details: { start_usable_battery_level: Math.round(socFrom), start_battery_level: Math.round(socFrom),
        end_usable_battery_level: Math.round(soc), end_battery_level: Math.round(soc), reduced_range: false, is_sufficiently_precise: true },
      range_ideal: { start_range: round(socFrom * kmPerPct, 1), end_range: round(soc * kmPerPct, 1), range_diff: round((socFrom - soc) * kmPerPct, 1) },
      range_rated: { start_range: round(socFrom * kmPerPct, 1), end_range: round(soc * kmPerPct, 1), range_diff: round((socFrom - soc) * kmPerPct, 1) },
      outside_temp_avg: round(temp, 1), inside_temp_avg: round(20 + R() * 2, 1),
      energy_consumed_net: round(kwh, 2), consumption_net: round(eff, 1),
      _from: from, _to: to, _highway: highway,
    });
    odo += km;
    return at + min * 60000;
  }

  function charge(place, at, target, fast) {
    const cap = CAPACITY0 * health(odo);
    const from = soc, to = Math.min(target, 100);
    if (to - from < 3) return at;
    const kwh = ((to - from) / 100) * cap * (1 + (R() - 0.5) * 0.04);
    const kw = fast ? 95 + R() * 60 : 10.6 + R() * 0.4;
    const min = Math.round((kwh / (fast ? kw * 0.7 : kw)) * 60) + 2;
    const kmPerPct = (RANGE0 * health(odo)) / 100;
    soc = to;
    const used = fast ? kwh * 1.03 : kwh * 1.09;
    charges.push({
      charge_id: charges.length + 1, start_date: iso(at), end_date: iso(at + min * 60000),
      address: place.name, charge_energy_added: round(kwh, 2), charge_energy_used: round(used, 2),
      cost: round(kwh * (fast ? 0.52 : 0.24), 2), duration_min: min,
      duration_str: `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`,
      battery_details: { start_battery_level: Math.round(from), end_battery_level: Math.round(to) },
      range_ideal: { start_range: round(from * kmPerPct, 1), end_range: round(to * kmPerPct, 1) },
      range_rated: { start_range: round(from * kmPerPct, 1), end_range: round(to * kmPerPct * (1 + (R() - 0.5) * 0.015), 1) },
      outside_temp_avg: round(tempAt(at), 1), odometer: round(odo, 1),
      latitude: place.lat, longitude: place.lng, _fast: fast, _kw: kw,
    });
    return at + min * 60000;
  }

  const at = (day, h, m) => day + (h * 60 + m + Math.round((R() - 0.5) * 20)) * 60000;
  for (let day = start; day < today.getTime(); day += DAY) {
    const wd = new Date(day).getDay(), weekend = wd === 0 || wd === 6;
    if (!weekend && R() < 0.85) {
      let x = drive(P.home, P.office, at(day, 8, 10), false);
      if (R() < 0.25) { x = drive(P.office, P.gym, at(day, 12, 40), false); drive(P.gym, P.office, x + 60 * 60000, false); }
      x = drive(P.office, P.home, at(day, 18, 5), false);
      if (R() < 0.3) { const p = R() < 0.5 ? P.market : P.navigli; x = drive(P.home, p, at(day, 20, 0), false); drive(p, P.home, x + 75 * 60000, false); }
    } else if (weekend) {
      const r = R();
      if (r < 0.12) { // Torino, with a Supercharger stop on the way back
        charge(P.home, at(day, 6, 0), 90, false);
        let x = drive(P.home, P.torino, at(day, 9, 30), true);
        x = drive(P.torino, P.scWest, at(day, 17, 0), true);
        x = charge(P.scWest, x + 3 * 60000, 80, true);
        drive(P.scWest, P.home, x + 5 * 60000, true);
      } else if (r < 0.4) {
        const p = R() < 0.5 ? P.como : P.bergamo;
        drive(P.home, p, at(day, 10, 0), true);
        drive(p, P.home, at(day, 18, 30), true);
      } else if (r < 0.8) {
        const p = [P.duomo, P.navigli, P.market][Math.floor(R() * 3)];
        const x = drive(P.home, p, at(day, 11, 0), false);
        drive(p, P.home, x + (90 + R() * 120) * 60000, false);
      }
    }
    if (R() < 0.03) { const x = drive(P.home, P.linate, at(day, 6, 30), false); drive(P.linate, P.home, x + 20 * 60000, false); }
    if (soc < 22) charge(P.scEast, at(day, 21, 30), 75, true);
    if (soc < 55 || (soc < 70 && R() < 0.3)) charge(P.home, at(day, 22, 30), 80, false);
    soc = Math.max(5, soc - (0.5 + (Math.round(day / DAY) % 4) * 0.4)); // parked overnight: ~0.5-1.7 % lost (no RNG: keeps the other data the same)
  }

  const last = { odo, soc: 62, temp: tempAt(now), health: health(odo) };
  const ver = ['2025.38.4', '2025.44.2', '2026.2.6', '2026.8.3', '2026.14.6', '2026.20.4', '2026.26.7', '2026.32.5'];
  const updates = ver.map((v, i) => {
    const d = today.getTime() - (ver.length - 1 - i) * 49 * DAY - 9 * DAY;
    return { update_id: i + 1, start_date: iso(d + 2 * 3600000), end_date: iso(d + 2.5 * 3600000), version: v };
  }).reverse();
  return { drives, charges, updates, last, today: today.getTime(), now };
}

// GPS trace: a gentle curve between the two places, one point every 10 s, speed/power/elevation profiles.
function trace(d) {
  const R = rng(1000 + d.drive_id);
  const a = d._from, b = d._to, t0 = Date.parse(d.start_date), t1 = Date.parse(d.end_date);
  const n = Math.max(12, Math.round((t1 - t0) / 10000));
  const bend = (R() - 0.5) * 0.25, nx = -(b.lat - a.lat), ny = b.lng - a.lng;
  const vmax = d.speed_max;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1), s = Math.sin(Math.PI * f);
    const cruise = d._highway ? 0.8 + 0.2 * Math.sin(f * 9 + R()) : 0.35 + 0.6 * Math.abs(Math.sin(f * 23 + R() * 2));
    const speed = i === 0 || i === n - 1 ? 0 : Math.round(vmax * cruise * Math.min(1, s * 4));
    const prev = pts[i - 1];
    const accel = prev ? speed - prev.speed : 0;
    pts.push({
      detail_id: i + 1, date: iso(t0 + f * (t1 - t0)),
      latitude: round(a.lat + (b.lat - a.lat) * f + nx * bend * s + (R() - 0.5) * 0.0004, 6),
      longitude: round(a.lng + (b.lng - a.lng) * f + ny * bend * s + (R() - 0.5) * 0.0004, 6),
      speed, power: Math.round(speed * 0.18 + accel * 1.4 + (R() - 0.5) * 4),
      odometer: round(d.odometer_details.odometer_start + d.odometer_details.odometer_distance * f, 2),
      battery_level: Math.round(d.battery_details.start_battery_level + (d.battery_details.end_battery_level - d.battery_details.start_battery_level) * f),
      usable_battery_level: null,
      elevation: Math.round(a.elev + (b.elev - a.elev) * f + 12 * Math.sin(f * 7) * s),
    });
  }
  return pts;
}

// Charge curve: power tapers with SoC on DC, flat on AC.
function curve(c) {
  const t0 = Date.parse(c.start_date), t1 = Date.parse(c.end_date);
  const n = Math.max(10, Math.min(120, Math.round((t1 - t0) / 60000)));
  const from = c.battery_details.start_battery_level, to = c.battery_details.end_battery_level;
  return Array.from({ length: n }, (_, i) => {
    const f = i / (n - 1), soc = from + (to - from) * Math.sqrt(f);
    const kw = c._fast ? Math.round(c._kw * Math.min(1, 1.25 - soc / 100) + 4) : Math.round(c._kw);
    return {
      detail_id: i + 1, date: iso(t0 + f * (t1 - t0)), battery_level: Math.round(soc), usable_battery_level: Math.round(soc),
      charge_energy_added: round(c.charge_energy_added * f, 2), not_enough_power_to_heat: null,
      charger_details: c._fast
        ? { charger_actual_current: Math.round((kw * 1000) / 400), charger_phases: null, charger_pilot_current: 0, charger_power: kw, charger_voltage: 400 }
        : { charger_actual_current: 16, charger_phases: 3, charger_pilot_current: 16, charger_power: kw, charger_voltage: 230 },
      fast_charger_info: { fast_charger_present: !!c._fast, fast_charger_brand: c._fast ? 'Tesla' : '', fast_charger_type: c._fast ? 'Tesla' : '' },
      outside_temp: c.outside_temp_avg,
    };
  });
}

const strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));
// TM_MOCK_CARS=2 adds a second, newer car (to try the car choice in Altro → Questo dispositivo).
const CARS = [
  { car_id: 1, name: 'Silver Arrow', model: '3', trim: '74D', vin: '5YJ3E7EB0LF000001', seed: 42, odo0: 24300, charging: true },
  { car_id: 2, name: 'Red Comet', model: 'Y', trim: '74D', vin: '7SAYGDEE0PF000002', seed: 7, odo0: 3100, charging: false, trunkOpen: true }, // shows the warnings
];
const UNITS = { unit_of_length: 'km', unit_of_temperature: 'C', unit_of_pressure: 'bar' };
const DATA = {};

// → JSON-able response for /api/v1/... or null (404)
function raw(url) {
  const cars = CARS.slice(0, Math.max(1, Math.min(CARS.length, Number(process.env.TM_MOCK_CARS) || 1)));
  const u = new URL(url, 'http://x');
  const p0 = u.pathname.replace(/^\/api\/v1\//, '').replace(/\/$/, '');
  if (p0 === 'cars') return { data: { cars: cars.map(c => ({ car_id: c.car_id, name: c.name,
    car_details: { eid: c.car_id, vid: c.car_id, vin: c.vin, model: c.model, trim_badging: c.trim, efficiency: 0.153 } })) } };
  const cm = p0.match(/^cars\/(\d+)(\/.*)$/);
  const C = cm && cars.find(c => c.car_id === +cm[1]);
  if (!C) return null;
  const p = 'cars/1' + cm[2]; // same routes for every car
  if (!DATA[C.car_id] || Date.now() - DATA[C.car_id].now > 6 * 3600000) DATA[C.car_id] = build(Date.now(), C.seed, C.odo0);
  const D = DATA[C.car_id], km = D.last.odo, CAR = { car_id: C.car_id, car_name: C.name };
  if (p === 'cars/1/status') return { data: { car: CAR, units: UNITS, status: {
    display_name: CAR.car_name, state: C.charging ? 'charging' : 'asleep', state_since: iso(D.now - 47 * 60000), odometer: round(km, 1),
    car_status: { healthy: true, locked: true, sentry_mode: false, windows_open: false, doors_open: false, trunk_open: !!C.trunkOpen, frunk_open: false, is_user_present: false },
    car_details: { model: C.model, trim_badging: C.trim },
    car_geodata: { geofence: 'Home', location: { latitude: P.home.lat, longitude: P.home.lng }, latitude: P.home.lat, longitude: P.home.lng },
    car_versions: { version: D.updates[0].version, update_available: !!C.trunkOpen, update_version: C.trunkOpen ? '2026.38.6' : '' },
    driving_details: { shift_state: '', power: 0, speed: 0, heading: 0, elevation: P.home.elev },
    tpms_details: { tpms_pressure_fl: 2.9, tpms_pressure_fr: 2.875, tpms_pressure_rl: C.trunkOpen ? 2.45 : 2.9, tpms_pressure_rr: 2.9,
      tpms_soft_warning_fl: false, tpms_soft_warning_fr: false, tpms_soft_warning_rl: !!C.trunkOpen, tpms_soft_warning_rr: false },
    climate_details: { is_climate_on: false, inside_temp: round(D.last.temp + 3, 1), outside_temp: round(D.last.temp, 1), is_preconditioning: false },
    battery_details: { est_battery_range: 0, rated_battery_range: round(D.last.soc * RANGE0 * D.last.health / 100, 1), ideal_battery_range: round(D.last.soc * RANGE0 * D.last.health / 100, 1), battery_level: D.last.soc, usable_battery_level: D.last.soc },
    charging_details: { plugged_in: C.charging, charging_state: C.charging ? 'Charging' : 'Disconnected', charge_energy_added: 8.4, charge_limit_soc: 80, charge_port_door_open: true,
      charger_actual_current: 16, charger_phases: 3, charger_power: 11, charger_voltage: 230, time_to_full_charge: 1.25 },
  } } };
  if (p === 'cars/1/drives') {
    const from = u.searchParams.get('startDate'), to = u.searchParams.get('endDate');
    const list = D.drives.filter(d => (!from || d.start_date >= from) && (!to || d.end_date <= to)).reverse();
    return { data: { car: CAR, units: UNITS, drives: list.map(strip) } };
  }
  let m = p.match(/^cars\/1\/drives\/(\d+)$/);
  if (m) { const d = D.drives[+m[1] - 1]; return d && { data: { car: CAR, units: UNITS, drive: { ...strip(d), drive_details: trace(d) } } }; }
  if (p === 'cars/1/charges') return { data: { car: CAR, units: UNITS, charges: [...D.charges].reverse().map(strip) } };
  m = p.match(/^cars\/1\/charges\/(\d+)$/);
  if (m) { const c = D.charges[+m[1] - 1]; return c && { data: { car: CAR, units: UNITS, charge: { ...strip(c), charge_details: curve(c) } } }; }
  if (p === 'cars/1/battery-health') return { data: { car: CAR, units: UNITS, battery_health: {
    max_range: RANGE0, current_range: round(RANGE0 * D.last.health, 1), max_capacity: CAPACITY0,
    current_capacity: round(CAPACITY0 * D.last.health, 1), rated_efficiency: 0.153, battery_health_percentage: round(D.last.health * 100, 1) } } };
  if (p === 'cars/1/updates') return { data: { car: CAR, updates: D.updates } };
  return null;
}

// TM_MOCK_UNITS=imperial: what teslamateapi returns when TeslaMate is set to mi and °F
// (same fields it converts, including its consumption_net ×0.62 slip).
const KM = 0.62137119223733, F = (c) => round(c * 9 / 5 + 32, 1);
function imperial(r) {
  const d = r && r.data;
  if (!d) return r;
  const mi = (o, ...keys) => { for (const k of keys) if (o && typeof o[k] === 'number') o[k] = round(o[k] * KM, 2); };
  const fa = (o, ...keys) => { for (const k of keys) if (o && typeof o[k] === 'number') o[k] = F(o[k]); };
  const ranges = (o) => { mi(o.range_ideal, 'start_range', 'end_range', 'range_diff'); mi(o.range_rated, 'start_range', 'end_range', 'range_diff'); };
  const drive = (x) => {
    mi(x.odometer_details, 'odometer_start', 'odometer_end', 'odometer_distance'); mi(x, 'speed_avg', 'consumption_net');
    x.speed_max = Math.round(x.speed_max * KM); ranges(x); fa(x, 'outside_temp_avg', 'inside_temp_avg');
    for (const p of x.drive_details || []) { mi(p, 'odometer'); p.speed = Math.round(p.speed * KM); }
  };
  const charge = (x) => { ranges(x); mi(x, 'odometer'); fa(x, 'outside_temp_avg'); for (const p of x.charge_details || []) fa(p, 'outside_temp'); };
  if (d.units) d.units = { ...d.units, unit_of_length: 'mi', unit_of_temperature: 'F', ...(d.units.unit_of_pressure ? { unit_of_pressure: 'psi' } : {}) };
  if (d.status) { mi(d.status, 'odometer'); mi(d.status.battery_details, 'est_battery_range', 'rated_battery_range', 'ideal_battery_range'); fa(d.status.climate_details, 'inside_temp', 'outside_temp');
    for (const k of ['fl', 'fr', 'rl', 'rr']) { const t = d.status.tpms_details; if (t) t[`tpms_pressure_${k}`] = round(t[`tpms_pressure_${k}`] * 14.5038, 1); } }
  (d.drives || []).forEach(drive); if (d.drive) drive(d.drive);
  (d.charges || []).forEach(charge); if (d.charge) charge(d.charge);
  if (d.battery_health) mi(d.battery_health, 'max_range', 'current_range');
  return r;
}

// Deep copy first: nested objects are shared with the in-memory data and would be converted again on every call.
const handle = (url) => (process.env.TM_MOCK_UNITS === 'imperial' ? imperial(JSON.parse(JSON.stringify(raw(url)))) : raw(url));

module.exports = { handle, build };
