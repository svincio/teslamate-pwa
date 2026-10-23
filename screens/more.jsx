// Altro + Salute batteria + Luoghi + Aggiornamenti
// (spec: docs/design/screens/09-altro.html, 10-salute-batteria.html)

const APP_VERSION = '0.11.0';
const fmtDate = (iso) => { if (!iso) return '—'; const d = new Date(iso); return `${d.getDate()} ${MESI3[d.getMonth()]} ${d.getFullYear()}`; };

function MoreScreen({ api, open, pending, onPrefChange }) {
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
        {(window.TM_CAR?.cars || []).length > 1 && <PrefRow onChange={onPrefChange} label={tr('Auto da mostrare')} pref="car"
          options={[{ value: 'auto', label: tr('Predefinita') }, ...window.TM_CAR.cars.map(c => ({ value: c.id, label: c.name }))]}/>}
        <PrefRow onChange={onPrefChange} label={tr('Lingua')} pref="lang" options={[{ value: 'auto', label: 'Auto' }, { value: 'it', label: 'Italiano' }, { value: 'en', label: 'English' }]}/>
        <PrefRow onChange={onPrefChange} label={tr('Formato dei numeri')} pref="numbers" options={[{ value: 'auto', label: 'Auto' },
          { value: 'comma', label: '1.234,5' }, { value: 'dot', label: '1,234.5' }, { value: 'space', label: '1 234,5' }]}/>
        <PrefRow onChange={onPrefChange} label={tr("Formato dell'ora")} pref="clock" options={[{ value: 'auto', label: 'Auto' }, { value: '24', label: '24 h' }, { value: '12', label: '12 h' }]}/>
        <TextSizeRow/>
        <PrefRow onChange={onPrefChange} label={tr('Tema')} pref="theme" options={[{ value: 'auto', label: 'Auto' }, { value: 'light', label: tr('Chiaro') }, { value: 'dark', label: tr('Scuro') }]} last/>
      </ListCard>
      <p style={{ margin: '4px 16px', fontSize: 13, lineHeight: 1.4, color: t.sub }}>
        {pending && <b style={{ color: t.blue, fontWeight: 600 }}>{tr('Si applicano quando esci da Altro.')} </b>}
        {tr('Valgono solo su questo dispositivo. Auto: segue config.js sul server, se lo imposta, altrimenti il dispositivo.')}
      </p>

      <SectionLabel>{tr('Impostazioni')}</SectionLabel>
      <ListCard label={tr('Connessione e app')}>
        <Row label="TeslaMateAPI" value={<span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: conn[1] }}><span style={{ width: 8, height: 8, borderRadius: 4, background: conn[1] }}/>{conn[0]}</span>}/>
        <Row label={tr('Ultimo aggiornamento')} value={last}/>
        <Row label={tr('Aggiorna ora')} value={api.status === 'loading' || api.historyStatus === 'loading' ? tr('in corso…') : ''} valueColor={t.blue} onClick={api.refresh}/>
        <Row label={tr('Aggiornamento automatico')} value={cfg.refreshSeconds > 0 ? tr('ogni {n} s', { n: cfg.refreshSeconds }) : tr('spento')}
          sub={cfg.refreshSeconds > 15 ? tr('{n} s in viaggio o in carica', { n: 15 }) : null}/>
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

// A per-device setting: label above, segmented choice below; saved at once, applied when leaving Altro.
function PrefRow({ label, pref, options, last, onChange }) {
  const t = useT();
  const [value, setValue] = React.useState(TM_PREFS[pref] || 'auto');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0', borderBottom: last ? 'none' : `0.5px solid ${t.line}` }}>
      <div style={{ fontSize: 16 }}>{label}</div>
      {/* chips wrap instead of truncating: many cars, or large text */}
      {React.createElement(options.length > 5 || window.TM_TEXT_SCALE > 1.25 ? Chips : Seg, { small: true, label, options, value,
        onChange: (v) => { tmSetPref(pref, v); setValue(v); onChange(); } })}
    </div>
  );
}

// Text size: Auto, or a % on a slider (1% steps, magnets every 50%, − / + for the exact value).
// While dragging only the sample grows (the page reflowing under the finger would move the slider away);
// the whole app follows on release, at once.
function TextSizeRow() {
  const t = useT();
  const max = tmTextMax();
  const chosen = tmTextPct(tmPrefsNow().textSize);
  const [manual, setManual] = React.useState(chosen != null);
  const [v, setV] = React.useState(Math.round(window.TM_TEXT_SCALE * 100));
  const latest = React.useRef(v); latest.current = v;
  const clamp = (x) => Math.min(max, Math.max(TM_TEXT_MIN, Math.round(x)));
  const snap = (x) => { const m = Math.round(x / 50) * 50; return Math.abs(x - m) <= 4 ? m : x; };
  const apply = (x) => { x = clamp(x); setV(x); tmSetPref('textSize', String(x)); tmApplyText(); };
  const mode = (m) => {
    setManual(m === 'manual');
    if (m === 'manual') return apply(v);
    tmSetPref('textSize', null); setV(tmApplyText());
  };
  const shown = Math.min(v, max), f = (shown - TM_TEXT_MIN) / (max - TM_TEXT_MIN);
  const step = (d, label) => (
    <button type="button" aria-label={label} disabled={!manual || (d < 0 ? v <= TM_TEXT_MIN : v >= max)} onClick={() => apply(v + d)} style={{
      width: 44, height: 44, flex: 'none', borderRadius: 22, border: 0, background: t.inset2, color: t.text, font: 'inherit',
      fontSize: 24, lineHeight: 1, cursor: 'pointer', padding: 0, opacity: manual ? 1 : 0.4,
    }}>{d < 0 ? '−' : '+'}</button>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0', borderBottom: `0.5px solid ${t.line}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 16 }}>{tr('Dimensione testo')}</span>
        <span data-text-size style={{ fontSize: 22, fontWeight: 700 }}>{shown}%</span>
      </div>
      <Seg small label={tr('Dimensione testo')} options={[{ value: 'auto', label: 'Auto' }, { value: 'manual', label: tr('Manuale') }]}
        value={manual ? 'manual' : 'auto'} onChange={mode}/>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {step(-1, tr('Riduci'))}
        <div style={{ flex: 1, minWidth: 0, position: 'relative', paddingBottom: 24 }}>
          <input type="range" className="tm-slider" aria-label={tr('Dimensione testo')} min={TM_TEXT_MIN} max={max} step={1}
            value={shown} disabled={!manual}
            style={{ '--tm-fill': `${f * 100}%`, '--tm-on': t.blue, '--tm-off': t.track }}
            onChange={(e) => setV(snap(+e.target.value))}
            onPointerUp={() => apply(latest.current)} onTouchEnd={() => apply(latest.current)} onKeyUp={() => apply(latest.current)}/>
          {[100, 150, 200, 250, 300].filter(m => m <= max).map(m => { // magnets; labels every 100%
            const pos = `calc(18px + (100% - 36px) * ${(m - TM_TEXT_MIN) / (max - TM_TEXT_MIN)})`;
            return (
              <React.Fragment key={m}>
                <span aria-hidden="true" style={{ position: 'absolute', left: pos, top: 44, width: 2, height: 6, marginLeft: -1, background: t.sub, borderRadius: 1 }}/>
                {m % 100 === 0 && <span aria-hidden="true" style={{ position: 'absolute', left: pos, top: 51, transform: 'translateX(-50%)', fontSize: 11, color: t.sub }}>{m}%</span>}
              </React.Fragment>
            );
          })}
        </div>
        {step(1, tr('Aumenta'))}
      </div>
      <div aria-hidden="true" style={{ fontSize: (17 * v) / Math.round(window.TM_TEXT_SCALE * 100), fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap' }}>Aa 62 %</div>
      {chosen > max && <div style={{ fontSize: 13, color: t.sub }}>{tr('Scelto {n}%: su questo schermo al massimo {m}%.', { n: chosen, m: max })}</div>}
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
