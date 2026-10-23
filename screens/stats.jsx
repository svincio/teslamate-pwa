// Statistiche (spec: docs/design/screens/08-statistiche.html)

// Labels depend on TeslaMate's units, known only once /status has landed.
const metrics = (U) => [
  { value: 'km',  label: U.dist, kind: tr('Distanza totale'),  unit: U.dist, src: 'TM_MONTH_KM',   sum: true },
  { value: 'kwh', label: 'kWh',  kind: tr('Energia caricata'), unit: 'kWh',  src: 'TM_MONTH_KWH',  sum: true },
  { value: 'eur', label: CUR,    kind: tr('Costo totale'),     money: true,  src: 'TM_MONTH_COST', sum: true },
  { value: 'eff', label: U.eff,  kind: tr('Consumo medio'),    unit: U.eff,  src: 'TM_MONTH_EFF',  sum: false },
];
const fmtMetric = (m, v) => m.money ? fmtMoney(v) : `${fmtN(v)} ${m.unit}`;

const signed = (v, dec = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtN(Math.abs(v), dec)}`;

function StatsScreen({ api, metric, setMetric }) {
  const t = useT();
  const layout = useLayout();
  const drives = window.TM_DRIVES || [];
  const loading = !drives.length && api.historyStatus !== 'live';
  const U = tmUnits();
  const METRICS = metrics(U);
  const m = METRICS.find(x => x.value === metric) || METRICS[0];
  const vals = window[m.src] || [];
  const labels = window.TM_MONTH_LABELS || [];
  const max = Math.max(1, ...vals);
  const tot = vals.reduce((a, b) => a + b, 0);
  const nonZero = vals.filter(v => v > 0);
  const avg = m.sum ? tot / 12 : (nonZero.length ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0);
  const [selected, setSelected] = React.useState(() => Math.max(0, vals.length - 1));
  React.useEffect(() => setSelected(Math.max(0, vals.length - 1)), [metric, vals.length]);
  const picked = Math.min(selected, Math.max(0, vals.length - 1));
  const pickedValue = vals[picked] || 0;
  const pickedLabel = labels[picked] || '';
  const now = new Date(), start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const sub = `${tr('Ultimi 12 mesi')} · ${MESI3[start.getMonth()]} ${start.getFullYear()} – ${MESI3[now.getMonth()]} ${now.getFullYear()}`;

  // Drives long enough for a meaningful consumption figure.
  const good = drives.filter(d => (d.distance || d.km) >= 3 && d.eff > 0);
  const tempPts = good.filter(d => d.outsideTemp != null).map(d => ({ x: d.outsideTemp, y: d.eff }));
  const speedPts = good.filter(d => d.avgSpeed > 0).map(d => ({ x: d.avgSpeed, y: d.eff }));
  const cov = window.TM_COVERAGE;

  return (
    <Screen>
      <Title sub={sub}>{tr('Statistiche')}</Title>
      {loading ? <HistoryLoading/> : (
        <>
          <Card label={tr('Serie mensile')} style={{ padding: '14px 16px' }}>
            <Seg small label={tr('Metrica')} options={METRICS} value={m.value} onChange={setMetric}/>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontSize: 13, color: t.sub }}>{m.kind}</div>
                <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>{m.money ? fmtMoney(tot) : <>{fmtN(m.sum ? tot : avg)} <span style={{ fontSize: 16, color: t.sub, fontWeight: 500 }}>{m.unit}</span></>}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, color: t.sub }}>{tr('Media/mese')}</div>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{fmtMetric(m, avg)}</div>
              </div>
            </div>
            <div style={{ fontSize: 14, color: t.sub, minHeight: 20 }} data-month-value>{pickedLabel} · <b style={{ color: t.text }}>{fmtMetric(m, pickedValue)}</b></div>
            <div style={{ display: 'flex', gap: 7, height: 130 }}>
              <AxisScale top={fmtMetric(m, max)} mid={fmtMetric(m, max / 2)} bottom="0"/>
              <div data-month-bars role="group" aria-label={tr('Barre mensili')} style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 5, alignItems: 'stretch' }}>
                {vals.map((v, i) => {
                  const on = i === picked;
                  return <button key={i} type="button" aria-pressed={on} aria-label={`${labels[i]}: ${fmtMetric(m, v)}`} onClick={() => setSelected(i)} onMouseEnter={() => setSelected(i)}
                    style={{ minWidth: 0, padding: 0, border: 0, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'flex-end' }}>
                    <span style={{ width: '100%', height: `${Math.max(1, Math.round((v / max) * 100))}%`, background: on ? t.blue : t.blueSoft, borderRadius: '4px 4px 2px 2px' }}/>
                  </button>;
                })}
              </div>
            </div>
            <div style={{ paddingLeft: 39, display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 5, marginTop: -8, fontSize: 10, color: t.sub, textAlign: 'center' }}>
              {labels.map((l, i) => <span key={i} style={{ color: i === picked ? t.blue : undefined, fontWeight: i === picked ? 700 : undefined }}>{(l || '').charAt(0).toUpperCase()}</span>)}
            </div>
          </Card>

          <IdleCard/>

          <div style={layout === 'desk' ? { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 } : { display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ConsumptionScatter title={tr('Consumo vs temperatura')} pts={tempPts} unitX={U.temp} eff={U.eff} effMax={320 / U.kmPer} color={t.blue} fmtX={(x) => `${x < 0 ? '−' : ''}${fmtN(Math.abs(x))}°`}/>
            <ConsumptionScatter title={tr('Consumo vs velocità')} pts={speedPts} unitX={U.speed} eff={U.eff} effMax={320 / U.kmPer} color={t.orange} fmtX={(x) => `${fmtN(x)} ${U.speed}`}/>
          </div>
          {cov && cov.odo > 0 && (
            <Card label={tr('Copertura dei dati')} style={{ padding: '16px 18px', gap: 10 }}>
              <CardHead title={tr('Copertura TeslaMate')} right={<span style={{ fontSize: 26, fontWeight: 700 }}>{fmtN(cov.pct, 1)}%</span>}/>
              <Bar pct={cov.pct} color={t.blue}/>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: t.sub }}>
                <span>{tr('{n} {u} tracciati', { n: fmtN(cov.tracked), u: U.dist })}</span><span>{tr('{n} {u} odometro', { n: fmtN(cov.odo), u: U.dist })}</span>
              </div>
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}


// Battery lost while parked (api.jsx computeIdle): last 30 days and a monthly average for the last 12 months.
function IdleCard() {
  const t = useT();
  const stops = window.TM_IDLE || [];
  if (!stops.length) return null;
  const cap = (window.TM_STATS || {}).capacityKwh || 0; // real capacity from /battery-health; without it only %
  const now = new Date(), labels = window.TM_MONTH_LABELS || [];
  const last = idleSummary(stops, new Date(now.getTime() - 30 * 86400000), new Date(now.getTime() + 86400000), cap);
  const months = Array.from({ length: 12 }, (_, i) => {
    const x = idleSummary(stops, new Date(now.getFullYear(), now.getMonth() - 11 + i, 1), new Date(now.getFullYear(), now.getMonth() - 10 + i, 1), cap);
    return cap ? (x.kwhPerDay || 0) : x.pctPerDay;
  });
  const max = Math.max(0.0001, ...months);
  const [selected, setSelected] = React.useState(11);
  const picked = Math.min(selected, 11), value = months[picked] || 0;
  const monthLabel = labels[picked] || '';
  return (
    <Card label={tr('Consumo da fermo')} data-idle style={{ padding: '14px 16px' }}>
      <CardHead title={tr('Consumo da fermo')} note={tr('Soste negli ultimi 30 giorni: {n}', { n: fmtN(last.n) })}/>
      {last.n ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>
            {cap ? fmtN(last.kwhPerDay, 2) : fmtN(last.pctPerDay, 1)} <span style={{ fontSize: 16, color: t.sub, fontWeight: 500 }}>{cap ? tr('kWh al giorno') : tr('% al giorno')}</span>
          </div>
          {cap > 0 && <div style={{ fontSize: 15, color: t.sub }}>{fmtN(last.pctPerDay, 1)} {tr('% al giorno')}</div>}
        </div>
      ) : <div style={{ fontSize: 14, color: t.sub }}>{tr('Nessuna sosta di almeno 12 h negli ultimi 30 giorni')}</div>}
      <div style={{ fontSize: 14, color: t.sub, minHeight: 20 }} data-idle-month-value>{monthLabel} · <b style={{ color: t.text }}>{value ? `${cap ? fmtN(value, 2) + ' kWh' : fmtN(value, 1) + ' %'} ${tr('al giorno')}` : tr('Nessuna sosta di almeno 12 h')}</b></div>
      <div style={{ display: 'flex', gap: 7, height: 70 }}>
        <AxisScale top={`${cap ? fmtN(max, 2) + ' kWh' : fmtN(max, 1) + ' %'}`} mid={`${cap ? fmtN(max / 2, 2) + ' kWh' : fmtN(max / 2, 1) + ' %'}`} bottom="0"/>
        <div data-idle-month-bars role="group" aria-label={tr('Media mensile degli ultimi 12 mesi')} style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 5, alignItems: 'stretch' }}>
          {months.map((v, i) => {
            const on = i === picked, text = v ? `${cap ? fmtN(v, 2) + ' kWh' : fmtN(v, 1) + ' %'} ${tr('al giorno')}` : tr('Nessuna sosta di almeno 12 h');
            return <button key={i} type="button" aria-pressed={on} aria-label={`${labels[i] || ''}: ${text}`} onClick={() => setSelected(i)} onMouseEnter={() => setSelected(i)} style={{ minWidth: 0, padding: 0, border: 0, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'flex-end' }}>
              <span style={{ width: '100%', height: `${v ? Math.max(4, Math.round((v / max) * 100)) : 2}%`, background: on ? t.blue : t.blueSoft, borderRadius: '4px 4px 2px 2px' }}/>
            </button>;
          })}
        </div>
      </div>
      <div style={{ fontSize: 12, color: t.sub, lineHeight: 1.35 }}>{tr('Soste di almeno 12 h senza spostamenti né ricariche. La batteria è registrata a passi dell’1%: conta la media, non la singola sosta.')}</div>
    </Card>
  );
}

// The stop (≥ 12 h) that ended with this trip/charge, if any.
function IdleLine({ type, id }) {
  const t = useT();
  const s = (window.TM_IDLE || []).find(x => x.next.type === type && x.next.id === id);
  if (!s) return null;
  const value = `${fmtMin(s.hours * 60)} · −${fmtN(s.lostPct)}%${s.kwh != null ? ` · ${fmtN(s.kwh, 1)} kWh` : ''}`;
  // label above value, both wrapping: a Row would overflow on a narrow screen with large text
  return (
    <ListCard label={tr('Consumo da fermo')}>
      <div style={{ padding: '12px 0', overflowWrap: 'anywhere' }}>
        <div style={{ fontSize: 16 }}>{type === 'drive' ? tr('Sosta prima di questo viaggio') : tr('Sosta prima di questa ricarica')}</div>
        <div style={{ fontSize: 15, color: t.sub }}>{value}</div>
      </div>
    </ListCard>
  );
}

function ConsumptionScatter({ title, pts, unitX, eff, effMax, color, fmtX }) {
  const t = useT();
  if (pts.length < 5) return null;
  const xs = pts.map(p => p.x).sort((a, b) => a - b);
  const q = (a, f) => a[Math.min(a.length - 1, Math.max(0, Math.floor(f * (a.length - 1))))];
  const xMin = Math.floor(q(xs, 0.01)), xMax = Math.ceil(q(xs, 0.99));
  const yMin = effMax / 4, yMax = effMax; // 80-320 Wh/km: outside it's parking/short-trip noise
  const inRange = pts.filter(p => p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax);
  const fit = linFit(inRange);
  return (
    <Card label={title} style={{ padding: '14px 16px 12px', gap: 8 }}>
      <CardHead title={title} note={fit ? `${signed(fit.slope)} ${eff} per ${unitX}` : ''}/>
      <div style={{ display: 'flex', gap: 7, height: 130 }}>
        <AxisScale top={`${fmtN(yMax)} ${eff}`} mid={`${fmtN((yMin + yMax) / 2)} ${eff}`} bottom={`${fmtN(yMin)} ${eff}`}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Scatter label={tr('{title}, punti per viaggio con linea di tendenza', { title })} pts={inRange} color={color}
            xMin={xMin} xMax={xMax} yMin={yMin} yMax={yMax}
            trend={fit ? [{ x: xMin, y: fit.at(xMin) }, { x: xMax, y: fit.at(xMax) }] : null}/>
        </div>
      </div>
      <AxisLabels items={[fmtX(xMin), fmtX(Math.round((xMin + xMax) / 2)), fmtX(xMax)]} style={{ paddingLeft: 39 }}/>
    </Card>
  );
}

Object.assign(window, { StatsScreen, IdleLine });
