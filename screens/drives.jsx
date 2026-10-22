// Viaggi + dettaglio (spec: docs/design/screens/03-viaggi.html, 05-dettaglio-viaggio.html)

const PAGE = 60; // cards rendered at once: a year is ~1.400 drives

// Drives older than the in-memory window (tmDrivesSince) are fetched per period and kept for the session.
const olderDrives = {}; // key → { list } | { error } | 'loading'
const findDrive = (id) => (window.TM_DRIVES || []).find(x => x.id === id)
  || Object.values(olderDrives).flatMap(v => (v && v.list) || []).find(x => x.id === id);

function DrivesScreen({ api, open, period, setPeriod }) {
  const t = useT();
  const [limit, setLimit] = React.useState(PAGE);
  const [tick, bump] = React.useState(0);
  React.useEffect(() => setLimit(PAGE), [period.kind, period.off]);

  const r = periodRange(period);
  const key = `${r.from.toISOString()}|${r.to.toISOString()}`;
  const old = r.from < tmDrivesSince();
  React.useEffect(() => {
    if (!old || olderDrives[key]) return;
    olderDrives[key] = 'loading';
    tmLoadDrivesRange(tmReadConfig().carId, r.from, r.to)
      .then(list => { olderDrives[key] = { list }; }, e => { olderDrives[key] = { error: String(e.message || e) }; })
      .then(() => bump(n => n + 1));
  }, [key, tick]);

  const src = old ? olderDrives[key] : null;
  const all = old ? ((src && src.list) || []) : (window.TM_DRIVES || []);
  const loading = old ? (!src || src === 'loading') : (!all.length && api.historyStatus !== 'live');
  const list = all.filter(d => inPeriod(d._date, r));
  const km = list.reduce((s, d) => s + (d.distance || d.km), 0);
  const kwh = list.reduce((s, d) => s + d.kwh, 0);

  const groups = [];
  for (const d of list.slice(0, limit)) {
    const day = dayLabel(d._date, false) === 'Oggi' ? 'Oggi' : dayLabel(d._date);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(d); else groups.push({ day, items: [d] });
  }

  return (
    <Screen>
      <Title>Viaggi</Title>
      <PeriodBar value={period} onChange={setPeriod}/>
      {src && src.error && <ErrorBanner title="Viaggi non disponibili" text={`Non riesco a scaricare questo periodo: ${src.error}`} onRetry={() => { delete olderDrives[key]; bump(n => n + 1); }}/>}
      {loading ? <HistoryLoading/> : (
        <>
          <Card label="Riepilogo periodo" style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0 }}>
            <Stat size={26} v={fmtN(km)} label="km"/>
            <Stat size={26} v={fmtN(list.length)} label="viaggi"/>
            <Stat size={26} v={km ? fmtN((kwh * 1000) / km) : '—'} label="Wh/km medi"/>
          </Card>
          {!list.length && <Empty icon={ICONS.car} title="Nessun viaggio nel periodo" text="I viaggi registrati da TeslaMate compariranno qui."/>}
          {groups.map(g => (
            <div key={g.day} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2 style={{ margin: '6px 4px 0', fontSize: 15, fontWeight: 600, color: t.sub }}>{g.day}</h2>
              {g.items.map(d => <DriveCard key={d.id} d={d} onClick={() => open({ type: 'drive', id: d.id })}/>)}
            </div>
          ))}
          {list.length > limit && (
            <button type="button" onClick={() => setLimit(limit + PAGE * 2)} style={{ font: 'inherit', minHeight: 44, color: t.blue, fontSize: 16, fontWeight: 600, background: t.card, border: 0, borderRadius: 14, cursor: 'pointer' }}>
              Mostra altri ({fmtN(list.length - limit)})
            </button>
          )}
        </>
      )}
    </Screen>
  );
}

function DriveCard({ d, onClick }) {
  const t = useT();
  return (
    <div role="button" data-drive-id={d.id} onClick={onClick} style={{ display: 'flex', flexDirection: 'column', gap: 10, background: t.card, borderRadius: 20, padding: '14px 16px', cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 20, fontWeight: 700 }}>{fmtMin(d.durMin)}</span>
        <span style={{ fontSize: 14, color: t.sub }}>{d.time}</span>
      </div>
      <div style={{ fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.from} <span style={{ color: t.sub }}>→</span> {d.to}</div>
      <SocBar from={d.socFrom} to={d.socTo} accent={t.orange}/>
      <div style={{ display: 'flex', gap: 16, fontSize: 14, color: t.sub }}>
        <span><b style={{ color: t.text, fontWeight: 600 }}>{fmtN(d.distance || d.km, (d.distance || d.km) < 10 ? 1 : 0)}</b> km</span>
        <span><b style={{ color: t.text, fontWeight: 600 }}>{fmtN(d.avgSpeed)}</b> km/h</span>
        <span><b style={{ color: t.text, fontWeight: 600 }}>{d.eff ? fmtN(d.eff) : '—'}</b> Wh/km</span>
        {d.outsideTemp != null && <span style={{ marginLeft: 'auto' }}>{d.outsideTemp}°</span>}
      </div>
    </div>
  );
}

// Downsample a long per-second trace for charts (a 1 h drive is ~3.600 points).
function sample(arr, n = 160) {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]);
}

// Numbers for a slice of the GPS trace (all client-side: the trace is already downloaded).
function sectionStats(p) {
  const a = p[0], b = p[p.length - 1];
  const hav = (x, y) => {
    const R = 6371, r = Math.PI / 180, dLat = (y.lat - x.lat) * r, dLng = (y.lng - x.lng) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(x.lat * r) * Math.cos(y.lat * r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  let km = a.odometer && b.odometer ? b.odometer - a.odometer : 0;
  let kwh = 0, up = 0, down = 0, vmax = 0, gps = 0;
  for (let i = 0; i < p.length; i++) {
    vmax = Math.max(vmax, p[i].speed);
    if (!i) continue;
    const dtH = Math.min(300, (new Date(p[i].date) - new Date(p[i - 1].date)) / 1000) / 3600; // cap logging gaps at 5 min
    kwh += p[i - 1].power * dtH;
    const de = p[i].elevation - p[i - 1].elevation;
    if (de > 0) up += de; else down -= de;
    gps += hav(p[i - 1], p[i]);
  }
  if (!(km > 0)) km = gps;
  const min = (new Date(b.date) - new Date(a.date)) / 60000;
  return { km, min, kwh, up, down, vmax, avg: min ? km / (min / 60) : 0, whkm: km ? (kwh * 1000) / km : 0, soc: a.battery - b.battery, from: a.date, to: b.date };
}

const hms = (iso) => iso ? new Date(iso).toTimeString().slice(0, 8) : '—';

// Two-thumb slider over the trace indexes (native inputs: real touch handling and accessibility).
function RangePick({ n, sel, onChange, label }) {
  const t = useT();
  const [a, b] = sel;
  const pct = (i) => (n > 1 ? (i / (n - 1)) * 100 : 0);
  const set = (i, v) => { const next = [a, b]; next[i] = v; if (next[0] > next[1] - 1) return; onChange(next); };
  return (
    <div style={{ position: 'relative', height: 44, margin: '0 4px' }}>
      <div style={{ position: 'absolute', left: 15, right: 15, top: 19, height: 6, borderRadius: 3, background: t.track }}>
        <div style={{ position: 'absolute', left: `${pct(a)}%`, width: `${pct(b) - pct(a)}%`, top: 0, bottom: 0, borderRadius: 3, background: t.blue }}/>
      </div>
      <input type="range" className="tm-range" aria-label={`${label}: inizio`} min={0} max={n - 1} value={a} onChange={e => set(0, +e.target.value)} style={{ zIndex: a > n - 10 ? 3 : 2 }}/>
      <input type="range" className="tm-range" aria-label={`${label}: fine`} min={0} max={n - 1} value={b} onChange={e => set(1, +e.target.value)} style={{ zIndex: 2 }}/>
    </div>
  );
}

function DriveDetail({ id, onBack }) {
  const t = useT();
  const d = findDrive(id);
  const [trace, setTrace] = React.useState(() => (window.__driveTraceCache || {})[id] || null);
  const [err, setErr] = React.useState(null);
  const [sel, setSel] = React.useState(null);      // [i0, i1] on the trace, null = whole drive
  const [mapSel, setMapSel] = React.useState(null); // same, debounced: refitting the map on every slider tick is janky
  React.useEffect(() => { const h = setTimeout(() => setMapSel(sel), 250); return () => clearTimeout(h); }, [sel]);

  React.useEffect(() => {
    if (trace) return;
    window.__driveTraceCache = window.__driveTraceCache || {};
    window.loadDriveDetail(tmReadConfig().carId, id)
      .then(r => { window.__driveTraceCache[id] = r.points; setTrace(r.points); })
      .catch(e => setErr(String(e.message || e)));
  }, [id]);

  if (!d) return <Screen detail><BackLink label="Viaggi" onClick={onBack}/><Empty icon={ICONS.car} title="Viaggio non trovato" text=""/></Screen>;

  const n = trace ? trace.length : 0;
  const zoomed = !!sel && (sel[0] > 0 || sel[1] < n - 1);
  const part = trace && zoomed ? trace.slice(sel[0], sel[1] + 1) : trace;
  const sec = zoomed ? sectionStats(part) : null;
  const pts = part ? sample(part) : [];
  const times = pts.length ? [0, 1, 2, 3].map(i => hhmm(pts[Math.min(pts.length - 1, Math.round(i * (pts.length - 1) / 3))].date)) : [];
  const speeds = pts.map(p => p.speed), powers = pts.map(p => p.power), elev = pts.map(p => p.elevation);
  const maxOf = (a) => a.length ? Math.max(...a) : 0, minOf = (a) => a.length ? Math.min(...a) : 0;
  const charts = pts.length > 1 ? [
    { title: 'Velocità', note: `max ${fmtN(zoomed ? maxOf(part.map(p => p.speed)) : (d.speedMax || maxOf(speeds)))} km/h`, color: t.blue, vals: speeds, min: 0, max: Math.max(10, maxOf(speeds) * 1.15) },
    { title: 'Potenza', note: `max ${fmtN(maxOf(powers))} kW · rigenerazione sotto lo zero`, color: t.orange, vals: powers, min: Math.min(0, minOf(powers)) * 1.1, max: Math.max(10, maxOf(powers) * 1.1), zero: true },
    { title: 'Altitudine', note: `${fmtN(minOf(elev))}–${fmtN(maxOf(elev))} m`, color: t.purple, vals: elev, min: minOf(elev) - 5, max: maxOf(elev) + 5 },
  ] : [];
  const route = trace && trace.map(p => [p.lat, p.lng]);
  const mapZoomed = mapSel && (mapSel[0] > 0 || mapSel[1] < n - 1);
  const s = sel || [0, n - 1];

  return (
    <Screen detail>
      <BackLink label="Viaggi" onClick={onBack}/>
      <div style={{ padding: '0 4px' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>{d.from} → {d.to}</h1>
        <div style={{ fontSize: 15, color: t.sub, marginTop: 4 }}>{dayLabel(d._date)} · {d.time} – {hhmm(d._end)}</div>
      </div>

      {trace && trace.length > 1
        ? <OsmMap label="Percorso" height={200} route={route} highlight={mapZoomed ? route.slice(mapSel[0], mapSel[1] + 1) : null}/>
        : <Card label="Percorso" style={{ height: 200, alignItems: 'center', justifyContent: 'center', color: err ? t.red : t.sub, fontSize: 14 }}>
            {err ? `Traccia non disponibile: ${err}` : trace ? 'Nessun punto GPS per questo viaggio' : 'Carico il percorso…'}
          </Card>}

      {n > 2 && (
        <Card label="Seleziona tratto" style={{ padding: '14px 16px 10px', gap: 6 }}>
          <CardHead title="Tratto" right={zoomed
            ? <button type="button" onClick={() => setSel(null)} style={{ font: 'inherit', fontSize: 15, fontWeight: 600, color: t.blue, background: 'none', border: 0, padding: '6px 0', cursor: 'pointer' }}>Tutto il viaggio</button>
            : <span style={{ fontSize: 13, color: t.sub }}>trascina i cursori</span>}/>
          <RangePick n={n} sel={s} onChange={setSel} label="Tratto del viaggio"/>
          <div data-section-times style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontVariantNumeric: 'tabular-nums', color: zoomed ? t.text : t.sub }}>
            <span>{hms(trace[s[0]].date)}</span><span>{hms(trace[s[1]].date)}</span>
          </div>
        </Card>
      )}

      {sec && (
        <Card label="Tratto selezionato" data-section-stats style={{ padding: '16px 18px', gap: 0 }}>
          <Grid cols={3}>
            <Stat v={fmtN(sec.km, sec.km < 10 ? 2 : 1)} unit="km" label="Distanza"/>
            <Stat v={fmtMin(sec.min)} label="Durata"/>
            <Stat v={fmtN(sec.avg)} unit="km/h" label={`Media · max ${fmtN(sec.vmax)}`}/>
            <Stat v={fmtN(sec.kwh, 2)} unit="kWh" label="Energia"/>
            <Stat v={sec.km > 0.05 ? fmtN(sec.whkm) : '—'} unit="Wh/km" label="Consumo"/>
            <Stat v={`${sec.soc > 0 ? '−' : sec.soc < 0 ? '+' : ''}${fmtN(Math.abs(sec.soc))}%`} label="Batteria"/>
          </Grid>
          <div style={{ display: 'flex', gap: 16, borderTop: `0.5px solid ${t.line}`, paddingTop: 12, marginTop: 14, fontSize: 14, color: t.sub }}>
            <span>Dislivello <b style={{ color: t.text, fontWeight: 600 }}>+{fmtN(sec.up)} m</b> / <b style={{ color: t.text, fontWeight: 600 }}>−{fmtN(sec.down)} m</b></span>
          </div>
        </Card>
      )}

      <Card label="Numeri del viaggio" style={{ padding: '16px 18px', gap: 0 }}>
        <Grid cols={3}>
          <Stat v={fmtN(d.distance || d.km, 1)} unit="km" label="Distanza"/>
          <Stat v={fmtN(d.durMin)} unit="min" label="Durata"/>
          <Stat v={fmtN(d.avgSpeed)} unit="km/h" label="Vel. media"/>
          <Stat v={fmtN(d.kwh, 1)} unit="kWh" label="Energia"/>
          <Stat v={d.eff ? fmtN(d.eff) : '—'} unit="Wh/km" label="Consumo"/>
          <Stat v={d.outsideTemp != null ? `${d.outsideTemp}°` : '—'} label="Esterna"/>
        </Grid>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: `0.5px solid ${t.line}`, paddingTop: 14, marginTop: 16 }}>
          <span style={{ fontSize: 14, color: t.sub }}>Batteria</span>
          <div style={{ flex: 1 }}><SocBar from={d.socFrom} to={d.socTo} accent={t.orange} big/></div>
        </div>
      </Card>

      {charts.map(c => (
        <Card key={c.title} label={c.title} style={{ padding: '14px 16px 12px', gap: 8 }}>
          <CardHead title={zoomed ? `${c.title} · tratto` : c.title} note={c.note}/>
          <LineChart label={`${c.title} nel tempo`} zero={c.zero} series={[{ vals: c.vals, color: c.color, min: c.min, max: c.max, area: true }]}/>
          <AxisLabels items={times}/>
        </Card>
      ))}
    </Screen>
  );
}

Object.assign(window, { DrivesScreen, DriveDetail, sectionStats });
