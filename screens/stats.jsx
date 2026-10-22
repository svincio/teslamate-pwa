// Statistiche (spec: docs/design/screens/08-statistiche.html)

const METRICS = [
  { value: 'km',  label: 'km',    kind: tr('Distanza totale'), unit: 'km',    src: 'TM_MONTH_KM',   sum: true },
  { value: 'kwh', label: 'kWh',   kind: tr('Energia caricata'), unit: 'kWh',  src: 'TM_MONTH_KWH',  sum: true },
  { value: 'eur', label: '€',     kind: tr('Costo totale'),    unit: '€',     src: 'TM_MONTH_COST', sum: true, dec: 2 },
  { value: 'eff', label: 'Wh/km', kind: tr('Consumo medio'),   unit: 'Wh/km', src: 'TM_MONTH_EFF',  sum: false },
];

const signed = (v, dec = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtN(Math.abs(v), dec)}`;

function StatsScreen({ api, metric, setMetric }) {
  const t = useT();
  const drives = window.TM_DRIVES || [];
  const loading = !drives.length && api.historyStatus !== 'live';
  const m = METRICS.find(x => x.value === metric) || METRICS[0];
  const vals = window[m.src] || [];
  const labels = window.TM_MONTH_LABELS || [];
  const max = Math.max(1, ...vals);
  const tot = vals.reduce((a, b) => a + b, 0);
  const nonZero = vals.filter(v => v > 0);
  const avg = m.sum ? tot / 12 : (nonZero.length ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0);

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 13, color: t.sub }}>{m.kind}</div>
                <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>{fmtN(m.sum ? tot : avg, m.dec || 0)} <span style={{ fontSize: 16, color: t.sub, fontWeight: 500 }}>{m.unit}</span></div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, color: t.sub }}>{tr('Media/mese')}</div>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{fmtN(avg, m.dec || 0)} {m.unit}</div>
              </div>
            </div>
            <div role="img" aria-label={tr('Barre mensili')} style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 5, alignItems: 'end', height: 130 }}>
              {vals.map((v, i) => (
                <div key={i} title={`${labels[i]}: ${fmtN(v, m.dec || 0)} ${m.unit}`} style={{ height: `${Math.max(1, Math.round((v / max) * 100))}%`, background: i === vals.length - 1 ? t.blue : t.blueSoft, borderRadius: '4px 4px 2px 2px' }}/>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 5, marginTop: -8, fontSize: 10, color: t.sub, textAlign: 'center' }}>
              {labels.map((l, i) => <span key={i}>{(l || '').charAt(0).toUpperCase()}</span>)}
            </div>
          </Card>

          <ConsumptionScatter title={tr('Consumo vs temperatura')} pts={tempPts} unitX="°C" color={t.blue} fmtX={(x) => `${x < 0 ? '−' : ''}${fmtN(Math.abs(x))}°`}/>
          <ConsumptionScatter title={tr('Consumo vs velocità')} pts={speedPts} unitX="km/h" color={t.orange} fmtX={(x) => `${fmtN(x)} km/h`}/>

          {cov && cov.odo > 0 && (
            <Card label={tr('Copertura dei dati')} style={{ padding: '16px 18px', gap: 10 }}>
              <CardHead title={tr('Copertura TeslaMate')} right={<span style={{ fontSize: 26, fontWeight: 700 }}>{fmtN(cov.pct, 1)}%</span>}/>
              <Bar pct={cov.pct} color={t.blue}/>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: t.sub }}>
                <span>{tr('{n} km tracciati', { n: fmtN(cov.tracked) })}</span><span>{tr('{n} km odometro', { n: fmtN(cov.odo) })}</span>
              </div>
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

function ConsumptionScatter({ title, pts, unitX, color, fmtX }) {
  const t = useT();
  if (pts.length < 5) return null;
  const xs = pts.map(p => p.x).sort((a, b) => a - b);
  const q = (a, f) => a[Math.min(a.length - 1, Math.max(0, Math.floor(f * (a.length - 1))))];
  const xMin = Math.floor(q(xs, 0.01)), xMax = Math.ceil(q(xs, 0.99));
  const yMin = 80, yMax = 320; // Wh/km: outside this range it's parking/short-trip noise
  const inRange = pts.filter(p => p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax);
  const fit = linFit(inRange);
  return (
    <Card label={title} style={{ padding: '14px 16px 12px', gap: 8 }}>
      <CardHead title={title} note={fit ? `${signed(fit.slope)} Wh/km per ${unitX}` : ''}/>
      <Scatter label={tr('{title}, punti per viaggio con linea di tendenza', { title })} pts={inRange} color={color}
        xMin={xMin} xMax={xMax} yMin={yMin} yMax={yMax}
        trend={fit ? [{ x: xMin, y: fit.at(xMin) }, { x: xMax, y: fit.at(xMax) }] : null}/>
      <AxisLabels items={[fmtX(xMin), fmtX(Math.round((xMin + xMax) / 2)), fmtX(xMax)]}/>
    </Card>
  );
}

Object.assign(window, { StatsScreen });
