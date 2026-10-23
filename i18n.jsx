// ─────────────────────────────────────────────────────────────
// UI language: the choice made on this device (Altro → Questo dispositivo), else config.js `lang`,
// else the device language; English when that is not Italian.
// The Italian text is the key: tr('Viaggi') → 'Trips'; a missing translation falls back to Italian.
// Vars: tr('{n} viaggi', { n }) — an English entry can be [singular, plural], picked on n == 1.
// ─────────────────────────────────────────────────────────────

// Per-device settings, kept in localStorage: { lang?, numbers?, clock?, theme?, textSize?, car? }. Missing or 'auto' = not chosen here.
const TM_PREFS_KEY = 'tm.pwa.prefs';
const tmPrefsNow = () => { try { return JSON.parse(localStorage.getItem(TM_PREFS_KEY)) || {}; } catch { return {}; } };
const TM_PREFS = tmPrefsNow(); // as at start-up: what this run of the app uses
function tmSetPref(key, value) { // texts are prepared at start-up: applied by the next reload
  const p = tmPrefsNow(); // not TM_PREFS: several changes before the reload must all stick
  if (!value || value === 'auto') delete p[key]; else p[key] = value;
  try { localStorage.setItem(TM_PREFS_KEY, JSON.stringify(p)); } catch {} // private mode: stays as is
}
// Device choice, else config.js, else null (= decide from the device itself).
function tmChoice(key, allowed) {
  for (const v of [TM_PREFS[key], window.TMConfig && window.TMConfig[key]]) {
    const s = String(v || '').toLowerCase();
    if (allowed.includes(s)) return s;
  }
  return null;
}

const TM_LANG = tmChoice('lang', ['it', 'en']) || (/^it\b/i.test(navigator.language || '') ? 'it' : 'en');
const TM_LOCALE = TM_LANG === 'it' ? 'it-IT' : 'en-GB';
// Thousands/decimal separators: device choice, else config.js `numbers`, else the device's own format.
const TM_NUM_FORMATS = { comma: 'it-IT', dot: 'en-US', space: 'fr-FR' }; // 1.234,5 · 1,234.5 · 1 234,5
const TM_NUM_LOCALE = (() => {
  const c = tmChoice('numbers', Object.keys(TM_NUM_FORMATS));
  if (c) return TM_NUM_FORMATS[c];
  try { return new Intl.NumberFormat(navigator.language).resolvedOptions().locale; } catch { return 'en-US'; }
})();
document.documentElement.lang = TM_LANG;

// Clock: device choice, else config.js `clock` ("24" | "12"), else the device habit (AM/PM locales → 12 h).
const TM_H12 = (() => {
  const c = tmChoice('clock', ['24', '12']);
  if (c) return c === '12';
  try { return /h1[12]/.test(new Intl.DateTimeFormat(navigator.language, { hour: 'numeric' }).resolvedOptions().hourCycle || ''); }
  catch { return false; }
})();
const TM_CLOCK = [false, true].map(second => new Intl.DateTimeFormat(TM_LOCALE,
  { hour: 'numeric', minute: '2-digit', ...(second ? { second: '2-digit' } : {}), hour12: true }));
function fmtClock(iso, seconds) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  return TM_H12 ? TM_CLOCK[seconds ? 1 : 0].format(d) : d.toTimeString().slice(0, seconds ? 8 : 5);
}

const MESI = TM_LANG === 'it'
  ? ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre']
  : ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MESI3 = TM_LANG === 'it'
  ? ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic']
  : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const TM_EN = {
  // Tabs, titles, navigation
  'Stato': 'Status', 'Viaggi': 'Trips', 'Ricariche': 'Charges', 'Statistiche': 'Statistics', 'Altro': 'More',
  'Navigazione principale': 'Main navigation', 'Torna a {label}': 'Back to {label}',
  // Dates and periods
  'Oggi': 'Today', 'Ieri': 'Yesterday', 'Oggi, {date}': 'Today, {date}', 'Ieri · {date}': 'Yesterday · {date}',
  '{n} gg fa': '{n} days ago',
  'Giorno': 'Day', 'Settimana': 'Week', 'Mese': 'Month', 'Anno': 'Year', 'Tutto': 'All',
  'Tutto lo storico': 'All history', 'Questa settimana': 'This week', 'Settimana scorsa': 'Last week',
  'Periodo': 'Period', 'Tipo di periodo': 'Period type', 'Periodo precedente': 'Previous period', 'Periodo successivo': 'Next period',
  'da {n} min': 'for {n} min', 'da {n} h': 'for {n} h', 'da {n} giorni': 'for {n} days',
  'agg. ora': 'updated now', 'agg. {n} min fa': 'updated {n} min ago', 'agg. {when}': 'updated {when}',
  'Ultimi 12 mesi': 'Last 12 months',
  // Common states
  'Server non raggiungibile': 'Server unreachable',
  'TeslaMateAPI non risponde: {err}. Controlla la connessione al server (VPN?).': 'TeslaMateAPI is not responding: {err}. Check the connection to the server (VPN?).',
  'TeslaMateAPI non risponde. Mostro gli ultimi dati salvati, di {day} alle {time}.': 'TeslaMateAPI is not responding. Showing the last saved data, from {day} at {time}.',
  'TeslaMateAPI non risponde ({err}).': 'TeslaMateAPI is not responding ({err}).',
  'Connessione': 'Connection', 'Connessione a TeslaMate…': 'Connecting to TeslaMate…',
  'Caricamento storico': 'Loading history', 'Carico lo storico…': 'Loading history…',
  'Stato e ricarica in corso sono già aggiornati.': 'Status and current charge are already up to date.',
  'Riprova': 'Retry', 'Nessun risultato': 'No results',
  'Mappa a tutto schermo': 'Full-screen map', 'Chiudi mappa': 'Close map',
  // Car status
  'In viaggio': 'Driving', 'In carica': 'Charging', 'Offline': 'Offline', 'Parcheggiata': 'Parked',
  'Casa': 'Home', 'Pubblico': 'Public',
  // Status screen
  'Auto': 'Car', 'Auto chiusa': 'Car locked', 'Auto aperta': 'Car unlocked',
  'Sentinella attiva': 'Sentry mode on', 'Sentinella spenta': 'Sentry mode off',
  'Batteria': 'Battery', 'Autonomia': 'Range', 'Odometro': 'Odometer',
  'Temperature': 'Temperatures', 'Temperatura': 'Temperature', 'interna': 'inside', 'esterna': 'outside',
  'installato il {date}': 'installed on {date}', 'Posizione': 'Location', 'Riepilogo del mese': 'Month summary',
  'Statistiche ›': 'Statistics ›', '{n} viaggi': ['{n} trip', '{n} trips'], 'consumo medio': 'avg. consumption',
  '{n} ricariche': ['{n} charge', '{n} charges'], 'costo': 'cost',
  'Ricarica in corso': 'Charging', 'Auto collegata': 'Car plugged in', 'fine alle {time}': 'done at {time}',
  'Collegata, non in carica': 'Plugged in, not charging', 'limite {n}%': 'limit {n}%',
  'Potenza': 'Power', 'Aggiunti': 'Added', 'Corrente': 'Current',
  // Statistics
  'Distanza totale': 'Total distance', 'Energia caricata': 'Energy charged', 'Costo totale': 'Total cost',
  'Consumo medio': 'Average consumption', 'Serie mensile': 'Monthly series', 'Metrica': 'Metric',
  'Media/mese': 'Avg./month', 'Barre mensili': 'Monthly bars',
  'Consumo vs temperatura': 'Consumption vs temperature', 'Consumo vs velocità': 'Consumption vs speed',
  '{title}, punti per viaggio con linea di tendenza': '{title}, one dot per trip with trend line',
  'Copertura dei dati': 'Data coverage', 'Copertura TeslaMate': 'TeslaMate coverage',
  '{n} {u} tracciati': '{n} {u} tracked', '{n} {u} odometro': '{n} {u} odometer',
  // Trips
  'Viaggi non disponibili': 'Trips not available', 'Non riesco a scaricare questo periodo: {err}': 'Could not load this period: {err}',
  'Riepilogo periodo': 'Period summary', 'viaggi': 'trips', '{u} medi': 'avg. {u}',
  'Nessun viaggio nel periodo': 'No trips in this period', 'I viaggi registrati da TeslaMate compariranno qui.': 'Trips recorded by TeslaMate will show up here.',
  'Mostra altri ({n})': 'Show more ({n})', 'Mostra altre ({n})': 'Show more ({n})',
  'inizio': 'start', 'fine': 'end', 'Viaggio non trovato': 'Trip not found',
  'Velocità': 'Speed', 'Altitudine': 'Elevation',
  'max {v} kW · rigenerazione sotto lo zero': 'max {v} kW · regen below zero',
  'Percorso': 'Route', 'Traccia non disponibile: {err}': 'Route not available: {err}',
  'Nessun punto GPS per questo viaggio': 'No GPS points for this trip', 'Carico il percorso…': 'Loading route…',
  'Seleziona tratto': 'Select section', 'Tratto': 'Section', 'tratto': 'section', 'Tutto il viaggio': 'Whole trip',
  'trascina i cursori': 'drag the handles', 'Tratto del viaggio': 'Trip section', 'Tratto selezionato': 'Selected section',
  'Distanza': 'Distance', 'Durata': 'Duration', 'Media · max {v}': 'Avg. · max {v}', 'Energia': 'Energy',
  'Consumo': 'Consumption', 'Dislivello': 'Elevation gain', 'Numeri del viaggio': 'Trip figures',
  'Vel. media': 'Avg. speed', 'Esterna': 'Outside', '{title} nel tempo': '{title} over time',
  // Charges
  'Tutte': 'All', 'Casa · AC': 'Home · AC', 'Spesa': 'Spend', 'Mappa delle ricariche': 'Charging map',
  'Tipo di ricarica': 'Charge type', 'Nessuna ricarica DC': 'No DC charges', 'Nessuna ricarica AC': 'No AC charges',
  'Nessuna ricarica': 'No charges', 'nel periodo': 'in this period',
  'Le ricariche a colonnine rapide e Supercharger compariranno qui.': 'Fast charger and Supercharger sessions will show up here.',
  'Le ricariche registrate da TeslaMate compariranno qui.': 'Charges recorded by TeslaMate will show up here.',
  'Mostra tutte le ricariche': 'Show all charges', 'Ricarica non trovata': 'Charge not found', 'Completata': 'Completed',
  'Potenza media': 'Average power', 'Potenza media · max {v}': 'Average power · max {v}',
  'Costo · {v}/kWh': 'Cost · {v}/kWh', 'Costo · prezzo non impostato': 'Cost · no price set',
  'Autonomia aggiunta': 'Range added', 'Efficienza': 'Efficiency',
  '{v} kWh nella batteria': '{v} kWh into the battery', '{v} kWh dalla rete': '{v} kWh from the grid',
  'Curva di ricarica': 'Charging curve', '% batteria': '% battery',
  'Potenza e livello batteria durante la ricarica': 'Power and battery level while charging',
  'Curva non disponibile: {err}': 'Curve not available: {err}', 'Nessun dato di dettaglio': 'No detailed data',
  'Carico la curva…': 'Loading curve…', 'Dati tecnici': 'Technical data', 'Tensione': 'Voltage',
  'fase': 'phase', 'fasi': 'phases', 'Temperatura esterna': 'Outside temperature',
  // More
  'Connesso': 'Connected', 'Non raggiungibile': 'Unreachable', 'Aggiornamento…': 'Updating…',
  'Salute batteria': 'Battery health', 'In attesa dei dati': 'Waiting for data', 'Luoghi frequenti': 'Frequent places',
  '{n} luoghi': ['{n} place', '{n} places'], 'Aggiornamenti software': 'Software updates', 'Ultimo: {v}': 'Latest: {v}',
  'Impostazioni': 'Settings', 'Connessione e app': 'Connection and app', 'Ultimo aggiornamento': 'Last update',
  'Aggiorna ora': 'Refresh now', 'in corso…': 'in progress…', 'Aggiornamento automatico': 'Auto refresh',
  'ogni {n} s': 'every {n} s', 'spento': 'off', 'Installazione': 'Installed', 'Sulla schermata Home': 'On the Home Screen',
  'Nel browser': 'In the browser', 'Questo dispositivo': 'This device', 'Lingua': 'Language', 'Formato dei numeri': 'Number format', 'Tema': 'Theme', 'Manuale': 'Manual', 'Riduci': 'Smaller', 'Aumenta': 'Larger', 'Scelto {n}%: su questo schermo al massimo {m}%.': 'Chosen {n}%: at most {m}% on this screen.', 'Dimensione testo': 'Text size', '{n} s in viaggio o in carica': '{n} s while driving or charging', 'Disponibile': 'Available', 'Pneumatici': 'Tyres', 'controlla': 'check', 'Anteriore sinistra': 'Front left', 'Anteriore destra': 'Front right',
  'Posteriore sinistra': 'Rear left', 'Posteriore destra': 'Rear right', 'Aperto': 'Open', 'Porte': 'Doors', 'Finestrini': 'Windows', 'Bagagliaio': 'Trunk', 'Bagagliaio anteriore': 'Frunk',
  'Porta anteriore conducente': 'Driver front door', 'Porta posteriore conducente': 'Driver rear door',
  'Porta anteriore passeggero': 'Passenger front door', 'Porta posteriore passeggero': 'Passenger rear door', 'Si applicano quando esci da Altro.': 'Applied when you leave More.', 'Auto da mostrare': 'Car shown', 'Predefinita': 'Default', "Formato dell'ora": 'Time format', 'Chiaro': 'Light', 'Scuro': 'Dark', 'Versione app': 'App version', 'Storico: {err}': 'History: {err}',
  'Indirizzo e autenticazione si configurano in config.js sul server.': 'Server address and authentication are set in config.js on the server.',
  'Valgono solo su questo dispositivo. Auto: segue config.js sul server, se lo imposta, altrimenti il dispositivo.':
    'These apply to this device only. Auto: follows config.js on the server, if it sets one, otherwise the device.',
  'Nessun aggiornamento': 'No updates', 'Le versioni installate compariranno qui.': 'Installed versions will show up here.',
  'Dedotti da viaggi e ricariche degli ultimi 12 mesi': 'Derived from trips and charges of the last 12 months',
  'Luoghi': 'Places', '{n} visite': ['{n} visit', '{n} visits'], 'Nessun luogo': 'No places',
  'I luoghi compariranno dopo i primi viaggi.': 'Places will show up after the first trips.',
  'Capacità': 'Capacity', 'Autonomia massima': 'Maximum range', '{u} al 100%': '{u} at 100%',
  'Stima da {n} ricariche · {dist}': 'Estimated from {n} charges · {dist}', 'Stato di salute': 'State of health',
  'SoH stimato': 'Estimated SoH', '{v} kWh attuali': '{v} kWh now', '{v} kWh originali': '{v} kWh original',
  'cicli equivalenti': 'equiv. cycles', 'ricariche DC': 'DC charges', 'autonomia max': 'max range',
  '{title} in funzione della distanza percorsa': '{title} by distance driven',
  // Wide screens, CSV
  'Precedente': 'Previous', 'Successivo': 'Next',
  'Nessun viaggio selezionato': 'No trip selected', 'Scegli un viaggio dall’elenco.': 'Pick a trip from the list.',
  'Nessuna ricarica selezionata': 'No charge selected', 'Scegli una ricarica dall’elenco.': 'Pick a charge from the list.',
  'Consumo da fermo': 'Idle drain', 'Soste negli ultimi 30 giorni: {n}': 'Stops in the last 30 days: {n}',
  'kWh al giorno': 'kWh per day', '% al giorno': '% per day', 'al giorno': 'per day', 'Nessuna sosta di almeno 12 h': 'No stop of 12 h or more', 'Media mensile degli ultimi 12 mesi': 'Monthly average, last 12 months',
  'Nessuna sosta di almeno 12 h negli ultimi 30 giorni': 'No stop of 12 h or more in the last 30 days',
  'Soste di almeno 12 h senza spostamenti né ricariche. La batteria è registrata a passi dell’1%: conta la media, non la singola sosta.':
    'Stops of 12 h or more with no driving or charging. Battery level is logged in 1 % steps: the average counts, not a single stop.',
  'Sosta prima di questo viaggio': 'Parked before this trip', 'Sosta prima di questa ricarica': 'Parked before this charge',
  'Esporta CSV': 'Export CSV', 'ricariche': 'charges',
  'Inizio': 'Start', 'Fine': 'End', 'Da': 'From', 'A': 'To', 'Vel. max': 'Max speed',
  'Batteria inizio': 'Battery start', 'Batteria fine': 'Battery end', 'Temp. esterna': 'Outside temp.',
  'Odometro inizio': 'Odometer start', 'Odometro fine': 'Odometer end',
  'Luogo': 'Place', 'Tipo': 'Type', 'Energia aggiunta': 'Energy added', 'Energia dalla rete': 'Energy from grid',
  'Potenza max': 'Peak power', 'Costo': 'Cost', 'Prezzo': 'Price', 'Latitudine': 'Latitude', 'Longitudine': 'Longitude',
};

function tr(it, vars) {
  let s = TM_LANG === 'it' ? it : (TM_EN[it] ?? it);
  if (Array.isArray(s)) s = s[vars && vars.n == 1 ? 0 : 1]; // n may come preformatted ('1')
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s;
}

Object.assign(window, { TM_PREFS, tmPrefsNow, tmSetPref, tmChoice, TM_LANG, TM_LOCALE, TM_NUM_LOCALE, TM_H12, fmtClock, MESI, MESI3, tr });
