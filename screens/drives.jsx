// Viaggi + dettaglio (spec: docs/design/screens/03-viaggi.html, 05-dettaglio-viaggio.html)

const PAGE = 60; // cards rendered at once: a year is ~1.400 drives

// Drives older than the in-memory window (tmDrivesSince) are fetched per period and kept for the session.
const olderDrives = {}; // key → { list } | { error } | 'loading'
const findDrive = (id) => (window.TM_DRIVES || []).find(x => x.id === id)
  || Object.values(olderDrives).flatMap(v => (v && v.list) || []).find(x => x.id === id);

function DrivesScreen({ api, open, period, setPeriod }) {
  const t = useT();
  const U = tmUnits();
  const layout = useLayout();
  const desk = layout === 'desk';
  const [limit, setLimit] = React.useState(PAGE);
  const [tick, bump] = React.useState(0);
  const [selId, setSelId] = React.useState(null); // solo desk: elenco a sinistra, dettaglio a destra
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

  // Vista elenco+dettaglio (desk): la selezione segue il periodo/filtro, le frecce ↑↓ scorrono `list`.
  React.useEffect(() => {
    if (desk && !list.some(d => d.id === selId)) setSelId(list[0] ? list[0].id : null);
  }, [desk, key, list.length]);
  const onOpen = desk ? setSelId : (id) => open({ type: 'drive', id });
  const selIdx = list.findIndex(d => d.id === selId);

  const exportCsv = () => saveCsv(csvName(tr('viaggi'), r.label), [
    tr('Inizio'), tr('Fine'), tr('Da'), tr('A'), `${tr('Distanza')} (${U.dist})`, `${tr('Durata')} (min)`, `${tr('Energia')} (kWh)`,
    `${tr('Vel. media')} (${U.speed})`, `${tr('Vel. max')} (${U.speed})`, `${tr('Consumo')} (${U.eff})`,
    `${tr('Batteria inizio')} (%)`, `${tr('Batteria fine')} (%)`, `${tr('Temp. esterna')} (${U.temp})`,
    `${tr('Odometro inizio')} (${U.dist})`, `${tr('Odometro fine')} (${U.dist})`,
  ], list.map(d => [csvStamp(d._date), csvStamp(d._end), d.from, d.to, Number((d.distance || d.km).toFixed(2)), d.durMin, d.kwh,
    d.avgSpeed, d.speedMax, d.eff, d.socFrom, d.socTo, d.outsideTemp, d.odoStart, d.odoEnd]));

  const groups = [];
  for (const d of list.slice(0, limit)) {
    const day = dayLabel(d._date, false) === tr('Oggi') ? tr('Oggi') : dayLabel(d._date);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(d); else groups.push({ day, items: [d] });
  }

  const content = (
    <Screen>
      <Title>{tr('Viaggi')}</Title>
      <PeriodBar value={period} onChange={setPeriod}/>
      {src && src.error && <ErrorBanner title={tr('Viaggi non disponibili')} text={tr('Non riesco a scaricare questo periodo: {err}', { err: src.error })} onRetry={() => { delete olderDrives[key]; bump(n => n + 1); }}/>}
      {loading ? <HistoryLoading/> : (
        <>
          <Card label={tr('Riepilogo periodo')} style={{ padding: '16px 18px' }}>
            <Grid cols={3} style={{ gap: 0 }}>
              <Stat size={26} v={fmtN(km)} label={U.dist}/>
              <Stat size={26} v={fmtN(list.length)} label={tr('viaggi')}/>
              <Stat size={26} v={km ? fmtN((kwh * 1000) / km) : '—'} label={tr('{u} medi', { u: U.eff })}/>
            </Grid>
            {list.length > 0 && <ExportButton onClick={exportCsv}/>}
          </Card>
          {!list.length && <Empty icon={ICONS.car} title={tr('Nessun viaggio nel periodo')} text={tr('I viaggi registrati da TeslaMate compariranno qui.')}/>}
          {groups.map(g => (
            <div key={g.day} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2 style={{ margin: '6px 4px 0', fontSize: 15, fontWeight: 600, color: t.sub }}>{g.day}</h2>
              <div style={layout === 'wide' ? { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 } : { display: 'flex', flexDirection: 'column', gap: 10 }}>
                {g.items.map(d => <DriveCard key={d.id} d={d} selected={desk && d.id === selId} onClick={() => onOpen(d.id)}/>)}
              </div>
            </div>
          ))}
          {list.length > limit && (
            <button type="button" onClick={() => setLimit(limit + PAGE * 2)} style={{ font: 'inherit', minHeight: 44, color: t.blue, fontSize: 16, fontWeight: 600, background: t.card, border: 0, borderRadius: 14, cursor: 'pointer' }}>
              {tr('Mostra altri ({n})', { n: fmtN(list.length - limit) })}
            </button>
          )}
        </>
      )}
    </Screen>
  );

  if (!desk) return content;

  // due pannelli con scroll indipendente, riempiono l'area del contenuto (scroller con position: relative)
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 20 }}>
      <div style={{ width: 420, flex: 'none', overflowY: 'auto' }}>{content}</div>
      <div key={selId} style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        {selId
          ? <DriveDetail id={selId}
              onPrev={() => selIdx > 0 && setSelId(list[selIdx - 1].id)}
              onNext={() => selIdx >= 0 && selIdx < list.length - 1 && setSelId(list[selIdx + 1].id)}
              hasPrev={selIdx > 0} hasNext={selIdx >= 0 && selIdx < list.length - 1}/>
          : <Screen detail><Empty icon={ICONS.car} title={tr('Nessun viaggio selezionato')} text={tr('Scegli un viaggio dall’elenco.')}/></Screen>}
      </div>
    </div>
  );
}

function DriveCard({ d, selected, onClick }) {
  const t = useT();
  const U = tmUnits();
  return (
    <div role="button" data-drive-id={d.id} onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', gap: 10, background: t.card, borderRadius: 20, padding: '14px 16px', cursor: 'pointer',
      boxShadow: selected ? `0 0 0 2px ${t.blue}` : 'none',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 20, fontWeight: 700 }}>{fmtMin(d.durMin)}</span>
        <span style={{ fontSize: 14, color: t.sub }}>{d.time}</span>
      </div>
      <div style={{ fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.from} <span style={{ color: t.sub }}>→</span> {d.to}</div>
      <SocBar from={d.socFrom} to={d.socTo} accent={t.orange}/>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 14, color: t.sub }}>
        <span><b style={{ color: t.text, fontWeight: 600 }}>{fmtN(d.distance || d.km, (d.distance || d.km) < 10 ? 1 : 0)}</b> {U.dist}</span>
        <span><b style={{ color: t.text, fontWeight: 600 }}>{fmtN(d.avgSpeed)}</b> {U.speed}</span>
        <span><b style={{ color: t.text, fontWeight: 600 }}>{d.eff ? fmtN(d.eff) : '—'}</b> {U.eff}</span>
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
  if (!(km > 0)) km = gps * tmUnits().kmPer; // GPS distance is in km
  const min = (new Date(b.date) - new Date(a.date)) / 60000;
  return { km, min, kwh, up, down, vmax, avg: min ? km / (min / 60) : 0, whkm: km ? (kwh * 1000) / km : 0, soc: a.battery - b.battery, from: a.date, to: b.date };
}

const hms = (iso) => fmtClock(iso, true);

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
      <input type="range" className="tm-range" aria-label={`${label}: ${tr('inizio')}`} min={0} max={n - 1} value={a} onChange={e => set(0, +e.target.value)} style={{ zIndex: a > n - 10 ? 3 : 2 }}/>
      <input type="range" className="tm-range" aria-label={`${label}: ${tr('fine')}`} min={0} max={n - 1} value={b} onChange={e => set(1, +e.target.value)} style={{ zIndex: 2 }}/>
    </div>
  );
}

function DriveDetail({ id, onBack, onPrev, onNext, hasPrev, hasNext }) {
  const t = useT();
  const U = tmUnits();
  const layout = useLayout();
  const d = findDrive(id);
  const [trace, setTrace] = React.useState(() => (window.__driveTraceCache || {})[id] || null);
  const [err, setErr] = React.useState(null);
  const [sel, setSel] = React.useState(null);      // [i0, i1] on the trace, null = whole drive
  const [mapSel, setMapSel] = React.useState(null); // same, debounced: refitting the map on every slider tick is janky
  React.useEffect(() => { const h = setTimeout(() => setMapSel(sel), 250); return () => clearTimeout(h); }, [sel]);
  React.useEffect(() => setSel(null), [id]); // selezione viaggio precedente non deve sopravvivere al cambio con ↑↓

  React.useEffect(() => {
    if (trace) return;
    window.__driveTraceCache = window.__driveTraceCache || {};
    window.loadDriveDetail(tmReadConfig().carId, id)
      .then(r => { window.__driveTraceCache[id] = r.points; setTrace(r.points); })
      .catch(e => setErr(String(e.message || e)));
  }, [id]);

  if (!d) return <Screen detail><BackLink label={tr('Viaggi')} onClick={onBack}/><Empty icon={ICONS.car} title={tr('Viaggio non trovato')} text=""/></Screen>;

  const n = trace ? trace.length : 0;
  const zoomed = !!sel && (sel[0] > 0 || sel[1] < n - 1);
  const part = trace && zoomed ? trace.slice(sel[0], sel[1] + 1) : trace;
  const sec = zoomed ? sectionStats(part) : null;
  const pts = part ? sample(part) : [];
  const times = pts.length ? [0, 1, 2, 3].map(i => hhmm(pts[Math.min(pts.length - 1, Math.round(i * (pts.length - 1) / 3))].date)) : [];
  const speeds = pts.map(p => p.speed), powers = pts.map(p => p.power), elev = pts.map(p => p.elevation);
  const maxOf = (a) => a.length ? Math.max(...a) : 0, minOf = (a) => a.length ? Math.min(...a) : 0;
  const charts = pts.length > 1 ? [
    { title: tr('Velocità'), unit: U.speed, note: `max ${fmtN(zoomed ? maxOf(part.map(p => p.speed)) : (d.speedMax || maxOf(speeds)))} ${U.speed}`, color: t.blue, vals: speeds, min: 0, max: Math.max(10, maxOf(speeds) * 1.15) },
    { title: tr('Potenza'), unit: 'kW', note: tr('max {v} kW · rigenerazione sotto lo zero', { v: fmtN(maxOf(powers)) }), color: t.orange, vals: powers, min: Math.min(0, minOf(powers)) * 1.1, max: Math.max(10, maxOf(powers) * 1.1), zero: true },
    { title: tr('Altitudine'), unit: 'm', note: `${fmtN(minOf(elev))}–${fmtN(maxOf(elev))} m`, color: t.purple, vals: elev, min: minOf(elev) - 5, max: maxOf(elev) + 5 },
  ] : [];
  const route = trace && trace.map(p => [p.lat, p.lng]);
  const mapZoomed = mapSel && (mapSel[0] > 0 || mapSel[1] < n - 1);
  const s = sel || [0, n - 1];

  return (
    <Screen detail>
      {onBack && <BackLink label={tr('Viaggi')} onClick={onBack}/>}
      <div style={{ padding: '0 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>{d.from} → {d.to}</h1>
          <div style={{ fontSize: 15, color: t.sub, marginTop: 4 }}>{dayLabel(d._date)} · {d.time} – {hhmm(d._end)}</div>
        </div>
        {onPrev && <NavArrows onPrev={onPrev} onNext={onNext} hasPrev={hasPrev} hasNext={hasNext}/>}
      </div>

      {trace && trace.length > 1
        ? <OsmMap label={tr('Percorso')} height={200} route={route} highlight={mapZoomed ? route.slice(mapSel[0], mapSel[1] + 1) : null}/>
        : <Card label={tr('Percorso')} style={{ height: 200, alignItems: 'center', justifyContent: 'center', color: err ? t.red : t.sub, fontSize: 14 }}>
            {err ? tr('Traccia non disponibile: {err}', { err }) : trace ? tr('Nessun punto GPS per questo viaggio') : tr('Carico il percorso…')}
          </Card>}

      {n > 2 && (
        <Card label={tr('Seleziona tratto')} style={{ padding: '14px 16px 10px', gap: 6 }}>
          <CardHead title={tr('Tratto')} right={zoomed
            ? <button type="button" onClick={() => setSel(null)} style={{ font: 'inherit', fontSize: 15, fontWeight: 600, color: t.blue, background: 'none', border: 0, padding: '6px 0', cursor: 'pointer' }}>{tr('Tutto il viaggio')}</button>
            : <span style={{ fontSize: 13, color: t.sub }}>{tr('trascina i cursori')}</span>}/>
          <RangePick n={n} sel={s} onChange={setSel} label={tr('Tratto del viaggio')}/>
          <div data-section-times style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontVariantNumeric: 'tabular-nums', color: zoomed ? t.text : t.sub }}>
            <span>{hms(trace[s[0]].date)}</span><span>{hms(trace[s[1]].date)}</span>
          </div>
        </Card>
      )}

      {sec && (
        <Card label={tr('Tratto selezionato')} data-section-stats style={{ padding: '16px 18px', gap: 0 }}>
          <Grid cols={3}>
            <Stat v={fmtN(sec.km, sec.km < 10 ? 2 : 1)} unit={U.dist} label={tr('Distanza')}/>
            <Stat v={fmtMin(sec.min)} label={tr('Durata')}/>
            <Stat v={fmtN(sec.avg)} unit={U.speed} label={tr('Media · max {v}', { v: fmtN(sec.vmax) })}/>
            <Stat v={fmtN(sec.kwh, 2)} unit="kWh" label={tr('Energia')}/>
            <Stat v={sec.km > 0.05 ? fmtN(sec.whkm) : '—'} unit={U.eff} label={tr('Consumo')}/>
            <Stat v={`${sec.soc > 0 ? '−' : sec.soc < 0 ? '+' : ''}${fmtN(Math.abs(sec.soc))}%`} label={tr('Batteria')}/>
          </Grid>
          <div style={{ display: 'flex', gap: 16, borderTop: `0.5px solid ${t.line}`, paddingTop: 12, marginTop: 14, fontSize: 14, color: t.sub }}>
            <span>{tr('Dislivello')} <b style={{ color: t.text, fontWeight: 600 }}>+{fmtN(sec.up)} m</b> / <b style={{ color: t.text, fontWeight: 600 }}>−{fmtN(sec.down)} m</b></span>
          </div>
        </Card>
      )}

      <Card label={tr('Numeri del viaggio')} style={{ padding: '16px 18px', gap: 0 }}>
        <Grid cols={layout === 'desk' ? 6 : 3}>
          <Stat v={fmtN(d.distance || d.km, 1)} unit={U.dist} label={tr('Distanza')}/>
          <Stat v={fmtN(d.durMin)} unit="min" label={tr('Durata')}/>
          <Stat v={fmtN(d.avgSpeed)} unit={U.speed} label={tr('Vel. media')}/>
          <Stat v={fmtN(d.kwh, 1)} unit="kWh" label={tr('Energia')}/>
          <Stat v={d.eff ? fmtN(d.eff) : '—'} unit={U.eff} label={tr('Consumo')}/>
          <Stat v={d.outsideTemp != null ? `${d.outsideTemp}°` : '—'} label={tr('Esterna')}/>
        </Grid>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, borderTop: `0.5px solid ${t.line}`, paddingTop: 14, marginTop: 16 }}>
          <span style={{ fontSize: 14, color: t.sub }}>{tr('Batteria')}</span>
          <div style={{ flex: '1 1 160px' }}><SocBar from={d.socFrom} to={d.socTo} accent={t.orange} big/></div>
        </div>
      </Card>

      <IdleLine type="drive" id={d.id}/>

      <div style={layout === 'desk' ? { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 } : { display: 'flex', flexDirection: 'column', gap: 14 }}>
        {charts.map(c => (
          <Card key={c.title} label={c.title} style={{ padding: '14px 16px 12px', gap: 8 }}>
            <CardHead title={zoomed ? `${c.title} · ${tr('tratto')}` : c.title} note={c.note}/>
            <div style={{ display: 'flex', gap: 7, height: 96 }}>
              <AxisScale top={`${fmtN(c.max)} ${c.unit}`} mid={`${fmtN((c.min + c.max) / 2)} ${c.unit}`} bottom={`${fmtN(c.min)} ${c.unit}`}/>
              <div style={{ flex: 1, minWidth: 0 }}><LineChart label={tr('{title} nel tempo', { title: c.title })} zero={c.zero} series={[{ vals: c.vals, color: c.color, min: c.min, max: c.max, area: true }]}/></div>
            </div>
            <AxisLabels items={times} style={{ paddingLeft: 39 }}/>
          </Card>
        ))}
      </div>
    </Screen>
  );
}

Object.assign(window, { DrivesScreen, DriveDetail, sectionStats });
