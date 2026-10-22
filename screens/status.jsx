// Stato — dashboard (spec: docs/design/screens/01-stato-chiaro.html, 11-stati-…)

function StatusScreen({ api, go }) {
  const t = useT();
  const car = window.TM_CAR || {};
  const st = window.TM_STATS || {};
  const ch = car.charging;
  const stale = api.status === 'error';
  const lastUpdate = (window.TM_UPDATES || [])[0];

  const statusTone = car.status === 'In carica' ? [t.greenBg, t.green]
    : car.status === 'In viaggio' ? [t.orangeBg, t.orange]
    : car.status === 'Offline' ? [t.inset, t.sub] : [t.blueBg, t.blue];
  const monthName = MESI[new Date().getMonth()];

  return (
    <Screen>
      <Title right={agoLabel(api.lastFetch)}>Stato</Title>

      {stale && (
        <ErrorBanner title="Server non raggiungibile"
          text={api.lastFetch
            ? `TeslaMateAPI non risponde. Mostro gli ultimi dati salvati, di ${dayShort(new Date(api.lastFetch).toISOString()).toLowerCase()} alle ${hhmm(new Date(api.lastFetch).toISOString())}.`
            : `TeslaMateAPI non risponde (${api.error}).`}
          onRetry={api.refresh}/>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, opacity: stale ? 0.6 : 1 }}>
        {ch && <ChargingCard car={car} ch={ch}/>}

        <Card label="Auto">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>{car.name || 'Auto'}</h2>
              <div style={{ fontSize: 15, color: t.sub, marginTop: 2 }}>{[car.shortName, car.trim].filter(Boolean).join(' · ')}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <RoundIcon d={ICONS.lock} on={car.locked} label={car.locked ? 'Auto chiusa' : 'Auto aperta'} onColor={t.green} onBg={t.greenBg} offColor={t.orange} offBg={t.orangeBg}/>
              <RoundIcon d={ICONS.shield} on={car.sentry} label={car.sentry ? 'Sentinella attiva' : 'Sentinella spenta'} onColor={t.red} onBg={t.orangeBg}/>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 12, background: statusTone[0], color: statusTone[1], fontSize: 14, fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: statusTone[1] }}/>{car.status || '—'}
            </span>
            <span style={{ fontSize: 14, color: t.sub }}>{sinceLabel(car.stateSince)}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', textAlign: 'center', borderTop: `0.5px solid ${t.line}`, paddingTop: 14 }}>
            <BigIconStat icon={<><rect x="2.5" y="7" width="17" height="10" rx="2.5"/><rect x="4.5" y="9" width={Math.max(1, 12 * (car.battery || 0) / 100)} height="6" rx="1" fill={t.blue} stroke="none"/><path d="M21.5 10.5v3" strokeLinecap="round"/></>}
              v={fmtN(car.battery)} unit="%" label="Batteria"/>
            <BigIconStat icon={<path d="M4 17a8 8 0 1 1 16 0 M12 17l3.5-4.5" strokeLinecap="round"/>} v={fmtN(car.range)} unit="km" label="Autonomia"/>
            <BigIconStat icon={<path d="M5 19L9 5M19 19L15 5M12 7v2M12 12v2M12 17v2" strokeLinecap="round"/>} v={fmtN(car.odometer)} unit="km" label="Odometro"/>
          </div>
        </Card>

        <Grid cols={2} style={{ gap: 14 }}>
          <Card label="Temperature" style={{ padding: 16, gap: 6 }}>
            <div style={{ fontSize: 13, color: t.sub, fontWeight: 600 }}>Temperatura</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <div><div style={{ fontSize: 30, fontWeight: 700 }}>{car.insideTemp ?? '—'}°</div><div style={{ fontSize: 12, color: t.sub }}>interna</div></div>
              <div><div style={{ fontSize: 30, fontWeight: 700, color: t.sub }}>{car.outsideTemp ?? '—'}°</div><div style={{ fontSize: 12, color: t.sub }}>esterna</div></div>
            </div>
          </Card>
          <Card label="Software" style={{ padding: 16, gap: 6 }}>
            <div style={{ fontSize: 13, color: t.sub, fontWeight: 600 }}>Software</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6, wordBreak: 'break-all' }}>{car.software || '—'}</div>
            {lastUpdate && lastUpdate.version === car.software && lastUpdate.date &&
              <div style={{ fontSize: 12, color: t.sub }}>installato il {new Date(lastUpdate.date).getDate()} {MESI3[new Date(lastUpdate.date).getMonth()]}</div>}
          </Card>
        </Grid>

        {car.lat && car.lng && (
          <OsmMap label="Posizione" height={180} zoom={15}
            markers={[{ lat: car.lat, lng: car.lng, color: t.blue, r: 11 }]}
            overlay={(car.geofence || car.location) && (
              <div style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 1000, padding: '7px 12px', borderRadius: 14, background: t.card, fontSize: 14, fontWeight: 600 }}>
                {car.geofence || car.location}
              </div>
            )}/>
        )}

        <Card label="Riepilogo del mese" style={{ padding: '16px 18px', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, textTransform: 'capitalize' }}>{monthName}</h2>
            <button type="button" onClick={() => go('stats')} style={{ font: 'inherit', fontSize: 15, color: t.blue, background: 'none', border: 0, minHeight: 44, margin: '-12px 0', padding: 0, cursor: 'pointer' }}>Statistiche ›</button>
          </div>
          <Grid cols={2} style={{ gap: '14px 12px' }}>
            <Stat size={24} v={fmtN(st.monthKm)} unit="km" label={`${fmtN(st.monthTrips)} viaggi`}/>
            <Stat size={24} v={st.monthEff ? fmtN(st.monthEff) : '—'} unit="Wh/km" label="consumo medio"/>
            <Stat size={24} v={fmtN(st.monthKwh)} unit="kWh" label={`${fmtN(st.monthCharges)} ricariche`} color={t.green}/>
            <Stat size={24} v={fmtEur(st.monthCost)} unit="€" label="costo"/>
          </Grid>
        </Card>
      </div>
    </Screen>
  );
}

function ChargingCard({ car, ch }) {
  const t = useT();
  const end = ch.active && ch.minutesToFull ? new Date(Date.now() + ch.minutesToFull * 60000) : null;
  return (
    <Card label={ch.active ? 'Ricarica in corso' : 'Auto collegata'}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: ch.active ? t.green : t.text }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={ICONS.bolt}/></svg>
          <span style={{ fontSize: 46, fontWeight: 700, letterSpacing: -1, lineHeight: 1 }}>{fmtN(car.battery)}</span>
          <span style={{ fontSize: 22, fontWeight: 600, alignSelf: 'flex-end', paddingBottom: 4 }}>%</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          {ch.active && end
            ? <><div style={{ fontSize: 17, fontWeight: 600 }}>{fmtMin(ch.minutesToFull)}</div>
                <div style={{ fontSize: 13, color: t.sub }}>fine alle {hhmm(end.toISOString())}</div></>
            : <div style={{ fontSize: 15, fontWeight: 600, color: t.sub }}>{ch.active ? 'In carica' : 'Collegata, non in carica'}</div>}
        </div>
      </div>
      <div>
        <Bar pct={car.battery} color={t.green} height={10} marker={ch.limitSoc}/>
        <div style={{ textAlign: 'right', marginTop: 6, fontSize: 12, color: t.sub }}>limite {ch.limitSoc}%</div>
      </div>
      {ch.active && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', textAlign: 'center', borderTop: `0.5px solid ${t.line}`, paddingTop: 12 }}>
          <Stat size={19} v={`${fmtN(ch.powerKw, ch.powerKw < 10 ? 1 : 0)} kW`} label="Potenza" align="center"/>
          <Stat size={19} v={`+${fmtN(ch.energyAddedKwh, 1)} kWh`} label="Aggiunti" align="center"/>
          <Stat size={19} v={`${fmtN(ch.currentA)} A`} label="Corrente" align="center"/>
        </div>
      )}
    </Card>
  );
}

function RoundIcon({ d, on, label, onColor, onBg, offColor, offBg }) {
  const t = useT();
  return (
    <div role="img" aria-label={label} style={{
      width: 36, height: 36, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: on ? onBg : (offBg || t.inset), color: on ? onColor : (offColor || t.sub),
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d}/></svg>
    </div>
  );
}

function BigIconStat({ icon, v, unit, label }) {
  const t = useT();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={t.blue} strokeWidth="1.8" aria-hidden="true">{icon}</svg>
      <div><span style={{ fontSize: 26, fontWeight: 700 }}>{v}</span><span style={{ fontSize: 15, color: t.sub }}> {unit}</span></div>
      <div style={{ fontSize: 13, color: t.sub }}>{label}</div>
    </div>
  );
}

Object.assign(window, { StatusScreen });
