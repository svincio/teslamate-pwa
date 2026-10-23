// ─────────────────────────────────────────────────────────────
// App shell: theme (follows iPhone), 5 tabs, detail screens over the list.
// Data lives in window.TM_* (api.jsx); every data update re-renders from here.
// ─────────────────────────────────────────────────────────────

// New settings apply with a reload (texts are prepared at start-up): tab and filters are carried over it.
const TM_RESUME_KEY = 'tm.pwa.resume';
const TM_RESUME = (() => {
  try { const r = JSON.parse(sessionStorage.getItem(TM_RESUME_KEY)) || {}; sessionStorage.removeItem(TM_RESUME_KEY); return r; }
  catch { return {}; }
})();

function App() {
  const t = useSystemTheme();
  const layout = useLayout(); // phone / wide / desk (0.10: sidebar + layout a 3 fasce)
  const api = useTeslaMate();
  const R = TM_RESUME;
  const [tab, setTab] = React.useState(R.tab || 'status');
  const [detail, setDetail] = React.useState(null);   // { type, id? } shown over the current tab
  // Filters live here so they survive tab switches, data refreshes and the settings reload.
  const [drivePeriod, setDrivePeriod] = React.useState(R.drivePeriod || { kind: 'mese', off: 0 });
  const [chargePeriod, setChargePeriod] = React.useState(R.chargePeriod || { kind: 'mese', off: 0 });
  const [chargeType, setChargeType] = React.useState(R.chargeType || 'all');
  const [metric, setMetric] = React.useState(R.metric || 'km');
  const [pending, setPending] = React.useState(false); // settings changed in Altro, applied when leaving it
  const scroller = React.useRef(null);

  const reloadTo = (state) => {
    try { sessionStorage.setItem(TM_RESUME_KEY, JSON.stringify({ tab, drivePeriod, chargePeriod, chargeType, metric, ...state })); } catch {}
    location.reload();
  };
  window.tmReloadHere = () => reloadTo({}); // car switch in the titles (kit.jsx): same tab, same filters
  // One reload for any number of changes, straight into the tab being opened.
  const go = (id) => {
    if (pending && id !== 'more') return reloadTo({ tab: id });
    setDetail(null); setTab(id); if (scroller.current) scroller.current.scrollTop = 0;
  };
  const back = () => setDetail(null);

  if (api.dataVersion === 0) {
    return <TMTheme.Provider value={t}><BootScreen api={api}/></TMTheme.Provider>;
  }

  const screens = {
    status:  <StatusScreen api={api} go={go}/>,
    drives:  <DrivesScreen api={api} open={setDetail} period={drivePeriod} setPeriod={setDrivePeriod}/>,
    charges: <ChargesScreen api={api} open={setDetail} period={chargePeriod} setPeriod={setChargePeriod} type={chargeType} setType={setChargeType}/>,
    stats:   <StatsScreen api={api} metric={metric} setMetric={setMetric}/>,
    more:    <MoreScreen api={api} open={setDetail} pending={pending} onPrefChange={() => setPending(true)}/>,
  };
  const details = detail && {
    drive:   () => <DriveDetail id={detail.id} onBack={back}/>,
    charge:  () => <ChargeDetail id={detail.id} onBack={back}/>,
    health:  () => <HealthDetail onBack={back}/>,
    places:  () => <PlacesDetail onBack={back}/>,
    updates: () => <UpdatesDetail onBack={back}/>,
  }[detail.type];

  // Oltre il telefono il contenuto resta leggibile: centrato, con un tetto che cresce con lo schermo.
  const Center = ({ children }) => layout === 'phone' ? children : (
    <div style={{ maxWidth: layout === 'wide' ? 900 : 'none', margin: '0 auto', width: '100%' }}>{children}</div>
  );

  return (
    <TMTheme.Provider value={t}>
      <div style={{ position: 'fixed', inset: 0, display: 'flex' }}>
        {layout === 'desk' && <TabBar side active={tab} onChange={go}/>}
        <div ref={scroller} style={{ flex: 1, minWidth: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: t.bg }}>
          <Center>{screens[tab]}</Center>
        </div>
      </div>
      {layout !== 'desk' && <TabBar active={tab} onChange={go}/>}
      {details && (
        <div key={`${detail.type}-${detail.id || ''}`} style={{ position: 'fixed', inset: 0, zIndex: 60, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: t.bg }}>
          <Center>{details()}</Center>
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
      <Title>{tr('Stato')}</Title>
      {failed
        ? <ErrorBanner title={tr('Server non raggiungibile')} text={tr('TeslaMateAPI non risponde: {err}. Controlla la connessione al server (VPN?).', { err: api.error })} onRetry={api.refresh}/>
        : <Card label={tr('Connessione')} style={{ alignItems: 'center', padding: '28px 18px', gap: 12 }}>
            <div className="tm-spin" style={{ width: 28, height: 28, borderRadius: 14, border: `3px solid ${t.track}`, borderTopColor: t.blue }}/>
            <div style={{ fontSize: 15, color: t.sub }}>{tr('Connessione a TeslaMate…')}</div>
          </Card>}
    </Screen>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
