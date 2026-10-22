// Ricariche + dettaglio (spec: docs/design/screens/06-ricariche.html, 07-dettaglio-ricarica.html)

const CHARGE_PERIODS = [...PERIOD_KINDS, { value: 'tutto', label: 'Tutto' }];
const CHARGE_TYPES = [
  { value: 'all', label: 'Tutte' }, { value: 'ac', label: 'Casa · AC' }, { value: 'dc', label: 'DC · Supercharger' },
];
const isDC = (c) => c.type !== 'home';

function ChargesScreen({ api, open, period, setPeriod, type, setType }) {
  const t = useT();
  const [limit, setLimit] = React.useState(PAGE);
  React.useEffect(() => setLimit(PAGE), [type, period.kind, period.off]);

  const all = window.TM_CHARGES || [];
  const loading = !all.length && api.historyStatus !== 'live';

  // The period filters the whole page: spend, map and list.
  const r = periodRange(period);
  const inP = all.filter(c => inPeriod(c._date, r));
  const sum = (arr, k) => arr.reduce((s, c) => s + (c[k] || 0), 0);
  const ac = inP.filter(c => !isDC(c)), dc = inP.filter(isDC);
  const acCost = sum(ac, 'cost'), dcCost = sum(dc, 'cost'), total = acCost + dcCost;
  const acKwh = sum(ac, 'kwh'), dcKwh = sum(dc, 'kwh');
  // Bar split by cost; by energy when no cost is configured yet (everything 0 €).
  const acShare = total ? acCost / total : (acKwh + dcKwh ? acKwh / (acKwh + dcKwh) : 1);

  const list = inP.filter(c => type === 'all' || (type === 'dc' ? isDC(c) : !isDC(c)));

  // One marker per place (~100 m grid); bigger when charged there more often.
  const places = new Map();
  for (const c of inP) {
    if (!c.lat || !c.lng) continue;
    const k = `${c.lat.toFixed(3)},${c.lng.toFixed(3)}`;
    const p = places.get(k) || { lat: c.lat, lng: c.lng, n: 0, dc: 0 };
    p.n++; if (isDC(c)) p.dc++;
    places.set(k, p);
  }
  const markers = [...places.values()].map(p => ({
    lat: p.lat, lng: p.lng, color: p.dc > p.n / 2 ? t.orange : t.green, r: Math.min(13, 6 + Math.log2(p.n)),
  }));

  return (
    <Screen>
      <Title>Ricariche</Title>
      <PeriodBar value={period} onChange={setPeriod} kinds={CHARGE_PERIODS}/>
      {loading ? <HistoryLoading/> : (
        <>
          <Card label="Spesa" style={{ padding: '16px 18px' }}>
            <div>
              <div style={{ fontSize: 13, color: t.sub }}>Spesa · {r.label} · {fmtN(inP.length)} ricariche</div>
              <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -0.5 }}>{fmtEur(total)} €</div>
            </div>
            <div aria-hidden="true" style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2, background: t.track }}>
              {acShare > 0 && <div style={{ width: `${acShare * 100}%`, background: t.green }}/>}
              {acShare < 1 && <div style={{ flex: 1, background: t.orange }}/>}
            </div>
            <Grid cols={2} style={{ gap: 12 }}>
              <Legend color={t.green} v={`${fmtEur(acCost)} €`} sub={`AC · Casa · ${fmtN(acKwh, acKwh < 10 ? 1 : 0)} kWh`}/>
              <Legend color={t.orange} v={`${fmtEur(dcCost)} €`} sub={`DC · Supercharger · ${fmtN(dcKwh, dcKwh < 10 ? 1 : 0)} kWh`}/>
            </Grid>
          </Card>

          {markers.length > 0 && (
            <OsmMap label="Mappa delle ricariche" height={170} markers={markers} overlay={
              <div style={{ position: 'absolute', left: 12, bottom: 10, zIndex: 1000, padding: '6px 10px', borderRadius: 12, background: t.card, fontSize: 12, display: 'flex', gap: 10 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: t.green }}/>AC</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: t.orange }}/>DC</span>
              </div>
            }/>
          )}

          <Chips label="Tipo di ricarica" options={CHARGE_TYPES} value={type} onChange={setType}/>

          {!list.length && <Empty icon={ICONS.bolt}
            title={`${type === 'dc' ? 'Nessuna ricarica DC' : type === 'ac' ? 'Nessuna ricarica AC' : 'Nessuna ricarica'}${period.kind === 'tutto' ? '' : ' nel periodo'}`}
            text={type === 'dc' ? 'Le ricariche a colonnine rapide e Supercharger compariranno qui.' : 'Le ricariche registrate da TeslaMate compariranno qui.'}
            action={type !== 'all' ? 'Mostra tutte le ricariche' : null} onAction={() => setType('all')}/>}

          {list.slice(0, limit).map(c => <ChargeCard key={c.id} c={c} onClick={() => open({ type: 'charge', id: c.id })}/>)}

          {list.length > limit && (
            <button type="button" onClick={() => setLimit(limit + PAGE * 2)} style={{ font: 'inherit', minHeight: 44, color: t.blue, fontSize: 16, fontWeight: 600, background: t.card, border: 0, borderRadius: 14, cursor: 'pointer' }}>
              Mostra altre ({fmtN(list.length - limit)})
            </button>
          )}
        </>
      )}
    </Screen>
  );
}

function Legend({ color, v, sub }) {
  const t = useT();
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span style={{ width: 10, height: 10, borderRadius: 5, background: color, marginTop: 5, flex: 'none' }}/>
      <div><div style={{ fontSize: 17, fontWeight: 600 }}>{v}</div><div style={{ fontSize: 13, color: t.sub }}>{sub}</div></div>
    </div>
  );
}

function ChargeCard({ c, onClick }) {
  const t = useT();
  const dc = isDC(c);
  const fg = dc ? t.orange : t.green, bg = dc ? t.orangeBg : t.greenBg;
  return (
    <div role="button" data-charge-id={c.id} onClick={onClick} style={{ display: 'flex', flexDirection: 'column', gap: 10, background: t.card, borderRadius: 20, padding: '14px 16px', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 12, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={dc ? ICONS.bolt : ICONS.house}/></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.where}</div>
          <div style={{ fontSize: 13, color: t.sub }}>{dayShort(c._date)}, {c.time} · {fmtMin(c.durMin)} · {dc ? 'DC' : 'AC'}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: fg, whiteSpace: 'nowrap' }}>+{fmtN(c.kwh, 1)} <span style={{ fontSize: 12, color: t.sub, fontWeight: 500 }}>kWh</span></div>
          <div style={{ fontSize: 13, color: t.sub }}>{fmtEur(c.cost)} €</div>
        </div>
      </div>
      <SocBar mode="charge" from={c.from} to={c.to} accent={fg}/>
    </div>
  );
}

const median = (a) => { const s = a.filter(Boolean).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

function ChargeDetail({ id, onBack }) {
  const t = useT();
  const c = (window.TM_CHARGES || []).find(x => x.id === id);
  const [det, setDet] = React.useState(null);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    loadChargeDetail(tmReadConfig().carId, id).then(setDet).catch(e => setErr(String(e.message || e)));
  }, [id]);

  if (!c) return <Screen detail><BackLink label="Ricariche" onClick={onBack}/><Empty icon={ICONS.bolt} title="Ricarica non trovata" text=""/></Screen>;

  const dc = isDC(c) || (det && det.fast);
  const fg = dc ? t.orange : t.green, bg = dc ? t.orangeBg : t.greenBg;
  const pts = det ? sample(det.points) : [];
  const powers = pts.map(p => p.powerKw), socs = pts.map(p => p.soc);
  const maxKw = powers.length ? Math.max(...powers) : 0;
  const avgKw = c.durMin ? c.kwh / (c.durMin / 60) : 0;
  const eff = c.kwhUsed ? (c.kwh / c.kwhUsed) * 100 : null;
  const socMin = socs.length ? Math.min(...socs) : 0, socMax = socs.length ? Math.max(...socs) : 100;
  const kwTop = Math.max(1, Math.ceil(maxKw * 1.1));
  const times = pts.length ? [0, 1, 2, 3].map(i => hhmm(pts[Math.min(pts.length - 1, Math.round(i * (pts.length - 1) / 3))].date)) : [];
  const volt = det && median(det.points.map(p => p.voltage));
  const amp = det && median(det.points.map(p => p.currentA));
  const phases = det && median(det.points.map(p => p.phases));

  return (
    <Screen detail>
      <BackLink label="Ricariche" onClick={onBack}/>
      <div style={{ padding: '0 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>{c.where}</h1>
          <div style={{ fontSize: 15, color: t.sub, marginTop: 4 }}>{dayLabel(c._date)} · {c.time} – {hhmm(c._end)}</div>
        </div>
        <span style={{ padding: '5px 10px', borderRadius: 12, background: bg, color: fg, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{dc ? 'DC' : 'AC'} · Completata</span>
      </div>

      <Card label="Energia caricata">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, color: fg }}>
          <span style={{ fontSize: 46, fontWeight: 700, letterSpacing: -1 }}>+{fmtN(c.kwh, 1)}</span><span style={{ fontSize: 18, fontWeight: 600 }}>kWh</span>
        </div>
        <SocBar mode="charge" from={c.from} to={c.to} accent={fg} height={10} big/>
        <Grid cols={2} style={{ gap: 14, borderTop: `0.5px solid ${t.line}`, paddingTop: 14 }}>
          <Stat size={20} v={fmtMin(c.durMin)} label="Durata"/>
          <Stat size={20} v={`${fmtN(avgKw, 1)} kW`} label={maxKw ? `Potenza media · max ${fmtN(maxKw, maxKw < 10 ? 1 : 0)}` : 'Potenza media'}/>
          <Stat size={20} v={`${fmtEur(c.cost)} €`} label={c.pricePerKwh ? `Costo · ${fmtN(c.pricePerKwh, 2)} €/kWh` : 'Costo · prezzo non impostato'}/>
          <Stat size={20} v={`+${fmtN(c.rangeAdded)} km`} label="Autonomia aggiunta"/>
        </Grid>
      </Card>

      {eff && (
        <Card label="Efficienza" style={{ padding: '16px 18px', gap: 10 }}>
          <CardHead title="Efficienza" right={<span style={{ fontSize: 26, fontWeight: 700 }}>{fmtN(Math.min(eff, 100), 1)}%</span>}/>
          <Bar pct={eff} color={t.green}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: t.sub }}>
            <span>{fmtN(c.kwh, 1)} kWh nella batteria</span><span>{fmtN(c.kwhUsed, 1)} kWh dalla rete</span>
          </div>
        </Card>
      )}

      <Card label="Curva di ricarica" style={{ padding: '14px 16px 12px', gap: 8 }}>
        <CardHead title="Curva di ricarica" right={
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: t.sub }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 3, borderRadius: 2, background: t.green }}/>kW</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 3, borderRadius: 2, background: t.blue }}/>% batteria</span>
          </div>}/>
        {pts.length > 1 ? (
          <>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: 11, color: t.green, height: 150, width: 24 }}>
                <span>{fmtN(kwTop)}</span><span>{fmtN(kwTop / 2, kwTop < 10 ? 1 : 0)}</span><span>0</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <LineChart height={150} label="Potenza e livello batteria durante la ricarica" series={[
                  { vals: powers, color: t.green, min: 0, max: kwTop, area: true },
                  { vals: socs, color: t.blue, min: socMin, max: Math.max(socMax, socMin + 1), width: 2.4 },
                ]}/>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: 11, color: t.blue, height: 150, width: 32, textAlign: 'right' }}>
                <span>{socMax}%</span><span>{Math.round((socMin + socMax) / 2)}%</span><span>{socMin}%</span>
              </div>
            </div>
            <AxisLabels items={times} style={{ padding: '0 32px 0 30px' }}/>
          </>
        ) : <div style={{ fontSize: 14, color: err ? t.red : t.sub, padding: '20px 0' }}>{err ? `Curva non disponibile: ${err}` : det ? 'Nessun dato di dettaglio' : 'Carico la curva…'}</div>}
      </Card>

      <ListCard label="Dati tecnici">
        <Row label="Tensione" value={volt ? `${fmtN(volt)} V` : '—'}/>
        <Row label="Corrente" value={amp ? `${fmtN(amp)} A${phases ? ` · ${phases} ${phases > 1 ? 'fasi' : 'fase'}` : ''}` : '—'}/>
        <Row label="Temperatura esterna" value={c.outsideTemp != null ? `${c.outsideTemp}°` : '—'} last/>
      </ListCard>
    </Screen>
  );
}

Object.assign(window, { ChargesScreen, ChargeDetail, isDC });
