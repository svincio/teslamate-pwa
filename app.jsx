// ─────────────────────────────────────────────────────────────
// App shell: theme (follows iPhone), 5 tabs, detail screens over the list.
// Data lives in window.TM_* (api.jsx); every data update re-renders from here.
// ─────────────────────────────────────────────────────────────

function App() {
  const t = useSystemTheme();
  const api = useTeslaMate();
  const [tab, setTab] = React.useState('status');
  const [detail, setDetail] = React.useState(null);   // { type, id? } shown over the current tab
  // Filters live here so they survive tab switches and data refreshes.
  const [drivePeriod, setDrivePeriod] = React.useState({ kind: 'mese', off: 0 });
  const [chargePeriod, setChargePeriod] = React.useState({ kind: 'mese', off: 0 });
  const [chargeType, setChargeType] = React.useState('all');
  const [metric, setMetric] = React.useState('km');
  const scroller = React.useRef(null);

  const go = (id) => { setDetail(null); setTab(id); if (scroller.current) scroller.current.scrollTop = 0; };
  const back = () => setDetail(null);

  if (api.dataVersion === 0) {
    return <TMTheme.Provider value={t}><BootScreen api={api}/></TMTheme.Provider>;
  }

  const screens = {
    status:  <StatusScreen api={api} go={go}/>,
    drives:  <DrivesScreen api={api} open={setDetail} period={drivePeriod} setPeriod={setDrivePeriod}/>,
    charges: <ChargesScreen api={api} open={setDetail} period={chargePeriod} setPeriod={setChargePeriod} type={chargeType} setType={setChargeType}/>,
    stats:   <StatsScreen api={api} metric={metric} setMetric={setMetric}/>,
    more:    <MoreScreen api={api} open={setDetail}/>,
  };
  const details = detail && {
    drive:   () => <DriveDetail id={detail.id} onBack={back}/>,
    charge:  () => <ChargeDetail id={detail.id} onBack={back}/>,
    health:  () => <HealthDetail onBack={back}/>,
    places:  () => <PlacesDetail onBack={back}/>,
    updates: () => <UpdatesDetail onBack={back}/>,
  }[detail.type];

  return (
    <TMTheme.Provider value={t}>
      <div ref={scroller} style={{ position: 'fixed', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: t.bg }}>
        {screens[tab]}
      </div>
      <TabBar active={tab} onChange={go}/>
      {details && (
        <div key={`${detail.type}-${detail.id || ''}`} style={{ position: 'fixed', inset: 0, zIndex: 60, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: t.bg }}>
          {details()}
        </div>
      )}
    </TMTheme.Provider>
  );
}

// First start without cached data: wait for /status, or show the error with Riprova.
function BootScreen({ api }) {
  const t = useT();
  const failed = api.status === 'error';
  return (
    <Screen>
      <Title>Stato</Title>
      {failed
        ? <ErrorBanner title="Server non raggiungibile" text={`TeslaMateAPI non risponde: ${api.error}. Controlla la connessione al server (VPN?).`} onRetry={api.refresh}/>
        : <Card label="Connessione" style={{ alignItems: 'center', padding: '28px 18px', gap: 12 }}>
            <div className="tm-spin" style={{ width: 28, height: 28, borderRadius: 14, border: `3px solid ${t.track}`, borderTopColor: t.blue }}/>
            <div style={{ fontSize: 15, color: t.sub }}>Connessione a TeslaMate…</div>
          </Card>}
    </Screen>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
