// Altro + Salute batteria + Luoghi + Aggiornamenti
// (spec: docs/design/screens/09-altro.html, 10-salute-batteria.html)

const APP_VERSION = '0.8.0';
const fmtDate = (iso) => { if (!iso) return '—'; const d = new Date(iso); return `${d.getDate()} ${MESI3[d.getMonth()]} ${d.getFullYear()}`; };

function MoreScreen({ api, open }) {
  const t = useT();
  const st = window.TM_STATS || {};
  const ups = window.TM_UPDATES || [];
  const geos = window.TM_GEOFENCES || [];
  const cfg = tmReadConfig();
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const conn = api.status === 'live' ? [tr('Connesso'), t.green] : api.status === 'error' ? [tr('Non raggiungibile'), t.red] : [tr('Aggiornamento…'), t.sub];
  const last = api.lastFetch ? `${dayShort(new Date(api.lastFetch).toISOString()).toLowerCase()}, ${hhmm(new Date(api.lastFetch).toISOString())}` : '—';

  return (
    <Screen>
      <Title>{tr('Altro')}</Title>

      <SectionLabel>{tr('Auto')}</SectionLabel>
      <ListCard label={tr('Auto')}>
        <Row label={tr('Salute batteria')} sub={st.soh ? `SoH ${fmtN(st.soh, 1)}% · ${fmtN(st.capacityKwh, 1)} kWh` : tr('In attesa dei dati')} icon={ICONS.battery} iconBg={t.iconGreen} onClick={() => open({ type: 'health' })}/>
        <Row label={tr('Luoghi frequenti')} sub={tr('{n} luoghi', { n: geos.length })} icon={ICONS.pin} iconBg={t.iconRed} onClick={() => open({ type: 'places' })}/>
        <Row label={tr('Aggiornamenti software')} sub={ups[0] ? tr('Ultimo: {v}', { v: ups[0].version }) : '—'} icon={ICONS.download} iconBg={t.iconGray} onClick={() => open({ type: 'updates' })} last/>
      </ListCard>

      {ups.length > 0 && <>
        <SectionLabel>{tr('Aggiornamenti software')}</SectionLabel>
        <UpdatesList items={ups.slice(0, 4)}/>
      </>}

      <SectionLabel>{tr('Questo dispositivo')}</SectionLabel>
      <ListCard label={tr('Questo dispositivo')}>
        <PrefRow label={tr('Lingua')} pref="lang" options={[{ value: 'auto', label: 'Auto' }, { value: 'it', label: 'Italiano' }, { value: 'en', label: 'English' }]}/>
        <PrefRow label={tr('Formato dei numeri')} pref="numbers" options={[{ value: 'auto', label: 'Auto' },
          { value: 'comma', label: '1.234,5' }, { value: 'dot', label: '1,234.5' }, { value: 'space', label: '1 234,5' }]}/>
        <PrefRow label={tr("Formato dell'ora")} pref="clock" options={[{ value: 'auto', label: 'Auto' }, { value: '24', label: '24 h' }, { value: '12', label: '12 h' }]}/>
        <PrefRow label={tr('Tema')} pref="theme" options={[{ value: 'auto', label: 'Auto' }, { value: 'light', label: tr('Chiaro') }, { value: 'dark', label: tr('Scuro') }]} last/>
      </ListCard>
      <p style={{ margin: '4px 16px', fontSize: 13, lineHeight: 1.4, color: t.sub }}>
        {tr('Valgono solo su questo dispositivo. Auto: segue config.js sul server, se lo imposta, altrimenti il dispositivo.')}
      </p>

      <SectionLabel>{tr('Impostazioni')}</SectionLabel>
      <ListCard label={tr('Connessione e app')}>
        <Row label="TeslaMateAPI" value={<span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: conn[1] }}><span style={{ width: 8, height: 8, borderRadius: 4, background: conn[1] }}/>{conn[0]}</span>}/>
        <Row label={tr('Ultimo aggiornamento')} value={last}/>
        <Row label={tr('Aggiorna ora')} value={api.status === 'loading' || api.historyStatus === 'loading' ? tr('in corso…') : ''} valueColor={t.blue} onClick={api.refresh}/>
        <Row label={tr('Aggiornamento automatico')} value={cfg.refreshSeconds > 0 ? tr('ogni {n} s', { n: cfg.refreshSeconds }) : tr('spento')}/>
        <Row label={tr('Installazione')} value={standalone ? tr('Sulla schermata Home') : tr('Nel browser')}/>
        <Row label={tr('Versione app')} value={APP_VERSION} last/>
      </ListCard>
      {(api.error || api.historyError) && <p style={{ margin: '4px 16px', fontSize: 13, color: t.red, wordBreak: 'break-word' }}>{[api.error, api.historyError && tr('Storico: {err}', { err: api.historyError })].filter(Boolean).join(' · ')}</p>}
      <p style={{ margin: '4px 16px', fontSize: 13, lineHeight: 1.4, color: t.sub }}>
        {tr('Indirizzo e autenticazione si configurano in config.js sul server.')}
      </p>
    </Screen>
  );
}

// A per-device setting: label above, segmented choice below; changing it reloads the app.
function PrefRow({ label, pref, options, last }) {
  const t = useT();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0', borderBottom: last ? 'none' : `0.5px solid ${t.line}` }}>
      <div style={{ fontSize: 16 }}>{label}</div>
      <Seg small label={label} options={options} value={TM_PREFS[pref] || 'auto'}
        onChange={(v) => { tmSetPref(pref, v); location.reload(); }}/>
    </div>
  );
}

function UpdatesList({ items }) {
  const t = useT();
  return (
    <ListCard label={tr('Aggiornamenti software')}>
      {items.map((u, i) => (
        <div key={u.version + i} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 52, borderBottom: i < items.length - 1 ? `0.5px solid ${t.line}` : 'none' }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: i === 0 ? t.green : t.line }}/>
          <span style={{ flex: 1, fontSize: 16 }}>{u.version}</span>
          <span style={{ fontSize: 14, color: t.sub }}>{fmtDate(u.date)}</span>
        </div>
      ))}
    </ListCard>
  );
}

function UpdatesDetail({ onBack }) {
  const ups = window.TM_UPDATES || [];
  return (
    <Screen detail>
      <BackLink label={tr('Altro')} onClick={onBack}/>
      <h1 style={{ margin: 0, padding: '0 4px', fontSize: 28, fontWeight: 700 }}>{tr('Aggiornamenti software')}</h1>
      {ups.length ? <UpdatesList items={ups}/> : <Empty icon={ICONS.download} title={tr('Nessun aggiornamento')} text={tr('Le versioni installate compariranno qui.')}/>}
    </Screen>
  );
}

function PlacesDetail({ onBack }) {
  const t = useT();
  const geos = window.TM_GEOFENCES || [];
  return (
    <Screen detail>
      <BackLink label={tr('Altro')} onClick={onBack}/>
      <div style={{ padding: '0 4px' }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>{tr('Luoghi frequenti')}</h1>
        <div style={{ fontSize: 15, color: t.sub, marginTop: 4 }}>{tr('Dedotti da viaggi e ricariche degli ultimi 12 mesi')}</div>
      </div>
      {geos.length ? (
        <ListCard label={tr('Luoghi')}>
          {geos.map((g, i) => <Row key={g.name} label={g.name} sub={tr('{n} visite', { n: fmtN(g.visits) })} value={g.lastVisit} icon={ICONS.pin} iconBg={g.type === 'home' ? t.iconGreen : t.iconRed} last={i === geos.length - 1}/>)}
        </ListCard>
      ) : <Empty icon={ICONS.pin} title={tr('Nessun luogo')} text={tr('I luoghi compariranno dopo i primi viaggi.')}/>}
    </Screen>
  );
}

// Median per km bucket → smooth trend line through noisy per-charge estimates.
function binnedTrend(pts, key, bins = 12) {
  if (pts.length < bins) return null;
  const lo = pts[0].km, hi = pts[pts.length - 1].km, w = (hi - lo) / bins || 1;
  const out = [];
  for (let b = 0; b < bins; b++) {
    const ys = pts.filter(p => p.km >= lo + b * w && p.km < lo + (b + 1) * w + (b === bins - 1 ? 1 : 0)).map(p => p[key]).sort((x, y) => x - y);
    if (ys.length) out.push({ x: lo + (b + 0.5) * w, y: ys[Math.floor(ys.length / 2)] });
  }
  return out.length > 1 ? out : null;
}

function HealthDetail({ onBack }) {
  const t = useT();
  const U = tmUnits();
  const st = window.TM_STATS || {};
  const car = window.TM_CAR || {};
  const cap = window.TM_CAPACITY_POINTS || [];
  const rng = window.TM_RANGE_POINTS || [];
  const sohPct = st.soh || (st.capacityMaxKwh ? (st.capacityKwh / st.capacityMaxKwh) * 100 : 0);

  const charts = [
    { title: tr('Capacità'), note: 'kWh', color: t.blue, pts: cap, key: 'kwh' },
    { title: tr('Autonomia massima'), note: tr('{u} al 100%', { u: U.dist }), color: t.purple, pts: rng, key: 'range' },
  ].filter(c => c.pts.length >= 5).map(c => {
    const ys = c.pts.map(p => p[c.key]).sort((a, b) => a - b);
    const q = (f) => ys[Math.floor(f * (ys.length - 1))];
    const yMin = Math.floor(q(0.02) * 0.98), yMax = Math.ceil(q(0.98) * 1.02);
    return { ...c, yMin, yMax, xMax: c.pts[c.pts.length - 1].km, trend: binnedTrend(c.pts, c.key) };
  });

  return (
    <Screen detail>
      <BackLink label={tr('Altro')} onClick={onBack}/>
      <div style={{ padding: '0 4px' }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>{tr('Salute batteria')}</h1>
        <div style={{ fontSize: 15, color: t.sub, marginTop: 4 }}>{tr('Stima da {n} ricariche · {dist}', { n: fmtN(cap.length), dist: `${fmtN(car.odometer)} ${U.dist}` })}</div>
      </div>

      <Card label={tr('Stato di salute')}>
        <div>
          <div style={{ fontSize: 13, color: t.sub }}>{tr('SoH stimato')}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, color: t.green }}>
            <span style={{ fontSize: 52, fontWeight: 700, letterSpacing: -1, lineHeight: 1.05 }}>{sohPct ? fmtN(sohPct, 1) : '—'}</span>
            <span style={{ fontSize: 22, fontWeight: 600 }}>%</span>
          </div>
        </div>
        <div>
          <Bar pct={sohPct} color={t.blue} height={10}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: t.sub, marginTop: 8 }}>
            <span>{tr('{v} kWh attuali', { v: fmtN(st.capacityKwh, 1) })}</span><span>{tr('{v} kWh originali', { v: fmtN(st.capacityMaxKwh, 1) })}</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', borderTop: `0.5px solid ${t.line}`, paddingTop: 14 }}>
          <Stat size={20} v={fmtN(st.cyclesEq)} label={tr('cicli equivalenti')}/>
          <Stat size={20} v={`${fmtN(st.dcPercent)}%`} label={tr('ricariche DC')}/>
          <Stat size={20} v={`${fmtN(st.rangeKm)} ${U.dist}`} label={tr('autonomia max')}/>
        </div>
      </Card>

      {charts.map(c => (
        <Card key={c.title} label={c.title} style={{ padding: '14px 16px 12px', gap: 8 }}>
          <CardHead title={c.title} note={c.note}/>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Scatter grid="lines" r={2.5} label={tr('{title} in funzione della distanza percorsa', { title: c.title })} pts={c.pts.map(p => ({ x: p.km, y: p[c.key] }))}
                color={c.color} xMin={0} xMax={c.xMax} yMin={c.yMin} yMax={c.yMax} trend={c.trend} trendColor={c.color}/>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: 11, color: t.sub, height: 130 }}>
              <span>{fmtN(c.yMax)}</span><span>{fmtN((c.yMin + c.yMax) / 2)}</span><span>{fmtN(c.yMin)}</span>
            </div>
          </div>
          <AxisLabels items={[`0 ${U.dist}`, fmtN(c.xMax / 2), `${fmtN(c.xMax)} ${U.dist}`]} style={{ paddingRight: 36 }}/>
        </Card>
      ))}
    </Screen>
  );
}

Object.assign(window, { MoreScreen, HealthDetail, PlacesDetail, UpdatesDetail });
