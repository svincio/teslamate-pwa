// ─────────────────────────────────────────────────────────────
// Shared UI kit for the restyled screens (spec: docs/design/screens/*.html).
// ─────────────────────────────────────────────────────────────

// ─── Formatting (locale and month names from i18n.jsx) ──────

const fmtN = (v, dec = 0) => (Number.isFinite(v) ? v : 0)
  .toLocaleString(TM_NUM_LOCALE, { minimumFractionDigits: dec, maximumFractionDigits: dec });
// Currency from config.js (ISO code); TeslaMate stores costs without one. Intl puts the symbol where the locale wants it.
const TM_MONEY = (() => {
  try { return new Intl.NumberFormat(TM_LOCALE, { style: 'currency', currency: tmReadConfig().currency }); }
  catch { return new Intl.NumberFormat(TM_LOCALE, { style: 'currency', currency: 'EUR' }); } // invalid code
})();
// Symbol where the UI language puts it, separators from the number format (e.g. Italian UI with 1,234.5).
const TM_SEP = new Intl.NumberFormat(TM_NUM_LOCALE).formatToParts(12345.6);
const sepOf = (type, d) => (TM_SEP.find(p => p.type === type) || { value: d }).value;
const fmtMoney = (v) => TM_MONEY.formatToParts(Number.isFinite(v) ? v : 0)
  .map(p => p.type === 'group' ? sepOf('group', ',') : p.type === 'decimal' ? sepOf('decimal', '.') : p.value).join('');
const CUR = TM_MONEY.formatToParts(0).find(p => p.type === 'currency').value;
const fmtMin = (m) => {
  m = Math.round(m || 0);
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 60)} h`;
};
const hhmm = (iso) => fmtClock(iso);
const sameDay = (a, b) => a.toDateString() === b.toDateString();

// "Oggi", "Ieri · 18 ottobre", "12 ottobre", "12 ottobre 2025"
function dayLabel(iso, withDate = true) {
  if (!iso) return '—';
  const d = new Date(iso), now = new Date(), y = new Date(); y.setDate(now.getDate() - 1);
  const date = `${d.getDate()} ${MESI[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : ''}`;
  if (sameDay(d, now)) return withDate ? tr('Oggi, {date}', { date }) : tr('Oggi');
  if (sameDay(d, y)) return withDate ? tr('Ieri · {date}', { date }) : tr('Ieri');
  return date;
}
// short: "Oggi" / "Ieri" / "12 ott" / "12 ott 2025" (year only when not the current one)
function dayShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso), now = new Date(), y = new Date(); y.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return tr('Oggi');
  if (sameDay(d, y)) return tr('Ieri');
  return `${d.getDate()} ${MESI3[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : ''}`;
}

// ─── Calendar periods with ‹ › navigation (Viaggi, Ricariche) ─
// A period is { kind, off }: off 0 = the current one, -1 = the previous, ...
const PERIOD_KINDS = [
  { value: 'giorno', label: tr('Giorno') }, { value: 'settimana', label: tr('Settimana') },
  { value: 'mese', label: tr('Mese') }, { value: 'anno', label: tr('Anno') },
];
// → { from, to (exclusive), label }
function periodRange({ kind, off = 0 }, now = new Date()) {
  const Y = now.getFullYear(), M = now.getMonth(), D = now.getDate();
  if (kind === 'tutto') return { from: new Date(0), to: new Date(8.64e15), label: tr('Tutto lo storico') };
  if (kind === 'anno') return { from: new Date(Y + off, 0, 1), to: new Date(Y + off + 1, 0, 1), label: String(Y + off) };
  if (kind === 'mese') {
    const from = new Date(Y, M + off, 1);
    const m = MESI[from.getMonth()];
    return { from, to: new Date(Y, M + off + 1, 1), label: `${m[0].toUpperCase()}${m.slice(1)} ${from.getFullYear()}` };
  }
  if (kind === 'settimana') {
    const from = new Date(Y, M, D - ((now.getDay() + 6) % 7) + 7 * off); // Monday
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
    const last = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 1);
    const yr = last.getFullYear() !== Y ? ` ${last.getFullYear()}` : '';
    const label = off === 0 ? tr('Questa settimana') : off === -1 ? tr('Settimana scorsa')
      : from.getMonth() === last.getMonth() ? `${from.getDate()}–${last.getDate()} ${MESI3[last.getMonth()]}${yr}`
      : `${from.getDate()} ${MESI3[from.getMonth()]} – ${last.getDate()} ${MESI3[last.getMonth()]}${yr}`;
    return { from, to, label };
  }
  const from = new Date(Y, M, D + off);
  return { from, to: new Date(Y, M, D + off + 1), label: dayLabel(from.toISOString(), false) };
}
const inPeriod = (iso, r) => { if (!iso) return false; const d = new Date(iso); return d >= r.from && d < r.to; };

// Segmented kinds + "‹ Ottobre 2026 ›". Tapping the label goes back to the current period.
function PeriodBar({ value, onChange, kinds = PERIOD_KINDS }) {
  const t = useT();
  const r = periodRange(value);
  const nav = value.kind !== 'tutto';
  const arrow = (dir, disabled) => (
    <button type="button" aria-label={dir < 0 ? tr('Periodo precedente') : tr('Periodo successivo')} disabled={disabled}
      onClick={() => onChange({ ...value, off: value.off + dir })} style={{
        width: 44, height: 40, border: 0, borderRadius: 12, background: 'transparent', font: 'inherit', fontSize: 26, lineHeight: 1,
        color: disabled ? t.track : t.blue, cursor: disabled ? 'default' : 'pointer', padding: 0,
      }}>{dir < 0 ? '‹' : '›'}</button>
  );
  return (
    <div role="group" aria-label={tr('Periodo')} style={{ display: 'flex', flexDirection: 'column', gap: 6, background: t.card, borderRadius: 18, padding: 8 }}>
      <Seg small label={tr('Tipo di periodo')} options={kinds} value={value.kind} onChange={(kind) => onChange({ kind, off: 0 })}/>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {nav ? arrow(-1, false) : <span style={{ width: 44 }}/>}
        <button type="button" data-period-label onClick={() => onChange({ ...value, off: 0 })} style={{
          flex: 1, border: 0, background: 'transparent', font: 'inherit', fontSize: 17, fontWeight: 600, color: t.text, cursor: 'pointer', minHeight: 40,
        }}>{r.label}</button>
        {nav ? arrow(1, value.off >= 0) : <span style={{ width: 44 }}/>}
      </div>
    </div>
  );
}
function sinceLabel(iso) {
  if (!iso) return '';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return tr('da {n} min', { n: m });
  if (m < 48 * 60) return tr('da {n} h', { n: Math.round(m / 60) });
  return tr('da {n} giorni', { n: Math.round(m / 1440) });
}
function agoLabel(ts) {
  if (!ts) return '';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return tr('agg. ora');
  if (m < 60) return tr('agg. {n} min fa', { n: m });
  return tr('agg. {when}', { when: `${dayShort(new Date(ts).toISOString()).toLowerCase()} ${hhmm(new Date(ts).toISOString())}` });
}

// Least-squares line through {x,y} points → { slope, at(x) }
function linFit(pts) {
  const n = pts.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of pts) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; }
  const den = n * sxx - sx * sx;
  if (!den) return null;
  const slope = (n * sxy - sx * sy) / den, icpt = (sy - slope * sx) / n;
  return { slope, at: (x) => icpt + slope * x };
}

// ─── CSV export ──────────────────────────────────────────────
// Excel-friendly: UTF-8 BOM, and ';' with a decimal comma when the number format uses the comma (as Excel expects there).
const csvStamp = (iso) => { // local "2026-10-23 18:05:00": Excel does not read ISO with Z
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
function csvText(header, rows) {
  const dec = sepOf('decimal', '.'), sep = dec === ',' ? ';' : ',';
  const cell = (v) => {
    if (v == null || Number.isNaN(v)) return '';
    if (typeof v === 'number') return String(v).replace('.', dec);
    const s = String(v);
    return /["\n\r;,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + [header, ...rows].map(r => r.map(cell).join(sep)).join('\r\n');
}
// iPhone/iPad: the share sheet (Save to Files, AirDrop...) works in the installed app; elsewhere a normal download.
async function saveCsv(name, header, rows) {
  const file = new File([csvText(header, rows)], name, { type: 'text/csv' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; } // closed the sheet: done; anything else: download
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csvName = (what, label) => `${what}-${label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.csv`;

function ExportButton({ onClick }) {
  const t = useT();
  return (
    <button type="button" data-export-csv onClick={onClick} style={{
      alignSelf: 'flex-start', minHeight: 44, padding: '0 4px', border: 0, background: 'none', font: 'inherit',
      fontSize: 15, fontWeight: 600, color: t.blue, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS.download}/></svg>
      {tr('Esporta CSV')}
    </button>
  );
}

// ─── Layout primitives ──────────────────────────────────────
const FONT = "-apple-system, 'SF Pro Text', system-ui, sans-serif";

// Three width tiers (telefono/tablet/desktop, soglie 700/1100), sulla larghezza reale:
// a testo grande <html> ha uno zoom CSS, quindi si divide per tornare ai px "fisici".
function useLayout() {
  const calc = () => {
    const w = window.innerWidth / (window.TM_TEXT_SCALE || 1);
    return w >= 1100 ? 'desk' : w >= 700 ? 'wide' : 'phone';
  };
  const [layout, setLayout] = React.useState(calc);
  React.useEffect(() => {
    const on = () => setLayout(calc());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return layout;
}

function Screen({ children, detail }) {
  const t = useT();
  return (
    <div style={{
      minHeight: '100%', boxSizing: 'border-box', background: t.bg, color: t.text, fontFamily: FONT,
      fontVariantNumeric: 'tabular-nums', display: 'flex', flexDirection: 'column', gap: 14,
      padding: detail
        ? 'calc(env(safe-area-inset-top, 0px) + 8px) 16px calc(env(safe-area-inset-bottom, 0px) + 40px)'
        : 'calc(env(safe-area-inset-top, 0px) + 18px) 16px calc(env(safe-area-inset-bottom, 0px) + 100px)',
    }}>{children}</div>
  );
}

// Quick car switch in every tab, only with more than one car: a pill over the native picker.
// The choice reloads the app into the same tab with the same filters (window.tmReloadHere, app.jsx).
function CarSwitch() {
  const t = useT();
  const car = window.TM_CAR || {};
  const cars = car.cars || [];
  if (cars.length < 2) return null;
  const cur = tmReadConfig().carId;
  return (
    <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 34, padding: '0 12px',
      borderRadius: 17, background: t.card, color: t.blue, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS.car}/></svg>
      <span>{(cars.find(c => c.id === cur) || {}).name || car.name}</span>
      <span aria-hidden="true" style={{ fontSize: 11 }}>▼</span>
      <select aria-label={tr('Auto da mostrare')} value={cur} onChange={(e) => { tmSetPref('car', e.target.value); window.tmReloadHere(); }}
        style={{ position: 'absolute', inset: 0, width: '100%', opacity: 0, fontSize: 16, cursor: 'pointer' }}>
        {cars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
  );
}

function Title({ children, right, sub }) {
  const t = useT();
  const multi = ((window.TM_CAR || {}).cars || []).length > 1;
  return (
    <div style={{ padding: '0 4px 4px' }}>
      {multi && <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}><CarSwitch/></div>}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 700, letterSpacing: -0.4, minWidth: 0, overflowWrap: 'anywhere' }}>{children}</h1>
        {right && <span style={{ fontSize: 13, color: t.sub, paddingBottom: 6 }}>{right}</span>}
      </div>
      {sub && <div style={{ fontSize: 14, color: t.sub }}>{sub}</div>}
    </div>
  );
}

function Card({ children, style, label, onClick, ...rest }) {
  const t = useT();
  return (
    <section aria-label={label} onClick={onClick} {...rest} style={{
      background: t.card, borderRadius: 22, padding: 18, display: 'flex', flexDirection: 'column', gap: 14,
      cursor: onClick ? 'pointer' : undefined, ...style,
    }}>{children}</section>
  );
}

function CardHead({ title, note, right }) {
  const t = useT();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h2>
      {right || <span style={{ fontSize: 13, color: t.sub, textAlign: 'right' }}>{note}</span>}
    </div>
  );
}

function BackLink({ label, onClick }) {
  const t = useT();
  return (
    <button type="button" onClick={onClick} aria-label={tr('Torna a {label}', { label })} style={{
      minHeight: 44, display: 'flex', alignItems: 'center', gap: 2, color: t.blue, background: 'none',
      border: 0, padding: 0, font: 'inherit', fontSize: 17, alignSelf: 'flex-start', cursor: 'pointer',
    }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
      {label}
    </button>
  );
}

// Prev/next through a list of siblings (vista elenco+dettaglio desktop). Anche con le frecce ↑↓ da tastiera.
function NavArrows({ onPrev, onNext, hasPrev, hasNext }) {
  const t = useT();
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === 'ArrowUp' && hasPrev) onPrev();
      else if (e.key === 'ArrowDown' && hasNext) onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPrev, onNext, hasPrev, hasNext]);
  const btn = (dir, disabled, onClick, label) => (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} style={{
      width: 34, height: 34, borderRadius: 10, border: 0, background: t.card, color: disabled ? t.track : t.blue,
      font: 'inherit', fontSize: 15, cursor: disabled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
    }}>{dir}</button>
  );
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {btn('↑', !hasPrev, onPrev, tr('Precedente'))}
      {btn('↓', !hasNext, onNext, tr('Successivo'))}
    </div>
  );
}

// Value + small unit + caption, as used all over the design.
function Stat({ v, unit, label, size = 22, color, align }) {
  const t = useT();
  return (
    <div style={{ textAlign: align }}>
      <div style={{ fontSize: size, fontWeight: 700, color }}>
        {v}{unit && <span style={{ fontSize: Math.max(12, Math.round(size * 0.55)), color: t.sub, fontWeight: 500 }}> {unit}</span>}
      </div>
      {label && <div style={{ fontSize: 13, color: t.sub }}>{label}</div>}
    </div>
  );
}

function Grid({ cols = 3, children, style }) {
  const [ref, w] = useWidth();
  // A testo grande su schermo stretto le colonne diventavano troppo piccole: le riduciamo in base
  // alla larghezza reale del contenitore (clientWidth, non affetto dallo zoom del testo).
  const n = Math.max(1, Math.min(cols, Math.floor((w / (window.TM_TEXT_SCALE || 1)) / 100)));
  return <div ref={ref} style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: '16px 8px', ...style }}>{children}</div>;
}

function Divider() {
  const t = useT();
  return <div style={{ borderTop: `0.5px solid ${t.line}` }}/>;
}

// iOS segmented control
function Seg({ options, value, onChange, label, small }) {
  const t = useT();
  return (
    <div role="group" aria-label={label} style={{
      display: 'grid', gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      background: t.inset2, borderRadius: small ? 10 : 12, padding: 3, gap: 2,
    }}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button key={i} type="button" aria-pressed={on} onClick={() => onChange(o.value)} style={{
            minHeight: small ? 34 : 36, border: 0, borderRadius: small ? 8 : 9, background: on ? t.seg : 'transparent',
            color: t.text, font: 'inherit', fontSize: small ? 13 : 14, fontWeight: on ? 600 : 500,
            boxShadow: on ? '0 1px 3px rgba(0,0,0,0.12)' : 'none', cursor: 'pointer', padding: '0 4px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', // large text on a narrow screen
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

function Chips({ options, value, onChange, label }) {
  const t = useT();
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button key={i} type="button" aria-pressed={on} onClick={() => onChange(o.value)} style={{
            minHeight: 36, padding: '0 14px', borderRadius: 18, border: `0.5px solid ${t.line}`,
            background: on ? t.chipOn : t.card, color: on ? t.chipOnFg : t.text,
            font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

// Plain progress bar (0-100)
function Bar({ pct, color, height = 8, marker }) {
  const t = useT();
  return (
    <div aria-hidden="true" style={{ position: 'relative', height, borderRadius: height / 2, background: t.track }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.max(0, Math.min(100, pct))}%`, borderRadius: height / 2, background: color || t.blue }}/>
      {marker != null && <div style={{ position: 'absolute', left: `${marker}%`, top: -4, bottom: -4, width: 2, borderRadius: 1, background: t.text }}/>}
    </div>
  );
}

// Battery bar "from% ▬▬▬ to%". Drive: blue up to `to`, `accent` for what was used.
// Charge: blue up to `from`, `accent` for what was added.
function SocBar({ from, to, accent, mode = 'drive', height = 8, big }) {
  const t = useT();
  const lo = Math.min(from, to), hi = Math.max(from, to);
  const seg = Math.max(hi - lo, 0.6);
  const base = mode === 'drive' ? to : from;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: big ? 14 : 13, color: t.sub, width: 34 }}>{Math.round(from)}%</span>
      <div aria-hidden="true" style={{ flex: 1, position: 'relative', height, borderRadius: height / 2, background: t.track }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${base}%`, borderRadius: mode === 'drive' ? height / 2 : `${height / 2}px 0 0 ${height / 2}px`, background: t.blue }}/>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${lo}%`, width: `${seg}%`, borderRadius: `0 ${height / 2}px ${height / 2}px 0`, background: accent || t.orange }}/>
      </div>
      <span style={{ fontSize: big ? 14 : 13, fontWeight: 600, color: mode === 'drive' ? t.blue : t.text, width: 38, textAlign: 'right' }}>{Math.round(to)}%</span>
    </div>
  );
}

// Grouped iOS-style list row
function Row({ label, value, sub, icon, iconBg, onClick, last, valueColor }) {
  const t = useT();
  return (
    <div onClick={onClick} role={onClick ? 'button' : undefined} style={{
      display: 'flex', alignItems: 'center', gap: 12, minHeight: 52, borderBottom: last ? 'none' : `0.5px solid ${t.line}`,
      cursor: onClick ? 'pointer' : undefined,
    }}>
      {icon && (
        <div style={{ width: 30, height: 30, borderRadius: 8, background: iconBg, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icon}/></svg>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0, padding: '8px 0' }}>
        <div style={{ fontSize: 16 }}>{label}</div>
        {sub && <div style={{ fontSize: 13, color: t.sub }}>{sub}</div>}
      </div>
      {value != null && <span style={{ fontSize: 15, color: valueColor || t.sub, textAlign: 'right' }}>{value}</span>}
      {onClick && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.sub} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>}
    </div>
  );
}

function ListCard({ children, label }) {
  const t = useT();
  return <section aria-label={label} style={{ background: t.card, borderRadius: 18, padding: '0 16px' }}>{children}</section>;
}

function SectionLabel({ children }) {
  const t = useT();
  return <h2 style={{ margin: '8px 16px 0', fontSize: 13, fontWeight: 500, color: t.sub, textTransform: 'uppercase', letterSpacing: 0.3 }}>{children}</h2>;
}

// ─── Charts (SVG, drawn at the real container width) ────────
function useWidth(initial = 326) {
  const ref = React.useRef(null);
  const [w, setW] = React.useState(initial);
  React.useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    // clientWidth, not getBoundingClientRect: with the text-size zoom the latter is already scaled and charts overflowed
    const set = () => setW(Math.max(100, Math.floor(el.clientWidth)));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// Line/area chart. series: [{ vals, color, min, max, area }], all sharing the x axis.
function LineChart({ series, height = 96, zero, label }) {
  const t = useT();
  const [ref, W] = useWidth();
  const H = height;
  const path = (s) => {
    const n = s.vals.length;
    if (n < 2) return null;
    const span = (s.max - s.min) || 1;
    const pts = s.vals.map((v, i) => [(i * W) / (n - 1), H - ((v - s.min) / span) * H]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const z = Math.max(0, Math.min(H, H - ((0 - s.min) / span) * H));
    return { line, area: `${line} L${W} ${z.toFixed(1)} L0 ${z.toFixed(1)} Z`, z };
  };
  const paths = series.map(path);
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ display: 'block', overflow: 'visible' }}>
        {zero && paths[0] && <line x1="0" y1={paths[0].z} x2={W} y2={paths[0].z} stroke={t.line} strokeWidth="1"/>}
        {series.map((s, i) => paths[i] && (
          <g key={i}>
            {s.area && <path d={paths[i].area} fill={s.color} opacity="0.16"/>}
            <path d={paths[i].line} fill="none" stroke={s.color} strokeWidth={s.width || 2} strokeLinejoin="round"/>
          </g>
        ))}
      </svg>
    </div>
  );
}

// Scatter with optional trend line. pts: [{x,y}]
function Scatter({ pts, color, xMin, xMax, yMin, yMax, height = 130, trend, trendColor, r = 3, label, grid = 'mid' }) {
  const t = useT();
  const [ref, W] = useWidth();
  const H = height;
  const X = (x) => ((x - xMin) / ((xMax - xMin) || 1)) * W;
  const Y = (y) => H - ((y - yMin) / ((yMax - yMin) || 1)) * H;
  let dots = '';
  for (const p of pts) {
    if (p.x < xMin || p.x > xMax || p.y < yMin || p.y > yMax) continue;
    const x = X(p.x), y = Y(p.y);
    dots += `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  }
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ display: 'block' }}>
        {grid === 'mid'
          ? <>
              <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} stroke={t.line}/>
              <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke={t.line} strokeDasharray="3 4"/>
            </>
          : <>
              <line x1="0" y1="0.5" x2={W} y2="0.5" stroke={t.line}/>
              <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke={t.line}/>
              <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} stroke={t.line}/>
            </>}
        <path d={dots} fill={color} opacity="0.42"/>
        {trend && <path d={trend.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ')}
          stroke={trendColor || t.text} strokeWidth="2.2" fill="none" strokeLinecap="round"/>}
      </svg>
    </div>
  );
}

function AxisLabels({ items, style }) {
  const t = useT();
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: t.sub, ...style }}>
      {items.map((x, i) => <span key={i}>{x}</span>)}
    </div>
  );
}

// ─── Map (Leaflet + OSM tiles, darkened via CSS in dark mode) ─
// Static mini-map: no dragging/zoom so it never traps the page scroll.
// markers: [{lat,lng,color,r,label}], route: [[lat,lng]...], start/end markers for routes.
// Small maps are static (page scroll wins); ⤢ opens an interactive full-screen copy (pinch, drag, double tap).
// `highlight` (sub-route) dims the rest of `route` and frames that section.
function OsmMap({ height = 180, center, zoom = 14, markers, route, highlight, overlay, label, interactive, fill }) {
  const t = useT();
  const box = React.useRef(null);
  const map = React.useRef(null);
  const layers = React.useRef([]);
  const [full, setFull] = React.useState(false);
  const hl = highlight && highlight.length > 1 ? highlight : null;
  const key = JSON.stringify([center, markers && markers.map(m => [m.lat, m.lng, m.color, m.r]), route && route.length,
    hl && [hl.length, hl[0], hl[hl.length - 1]], t.dark]);

  React.useEffect(() => {
    if (!box.current || !window.L) return;
    const L = window.L;
    if (!map.current) {
      const on = !!interactive;
      map.current = L.map(box.current, {
        zoomControl: false, attributionControl: false, dragging: on, touchZoom: on,
        scrollWheelZoom: on, doubleClickZoom: on, boxZoom: false, keyboard: false,
      });
      // OSM standard tiles: free, no key. Policy: visible attribution (overlay) + Referer (sent by browsers).
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map.current);
    }
    for (const l of layers.current) l.remove();
    layers.current = [];
    const add = (l) => { l.addTo(map.current); layers.current.push(l); return l; };
    const pad = interactive ? [48, 48] : [24, 24];

    if (route && route.length > 1) {
      add(L.polyline(route, { color: t.blue, weight: 4, opacity: hl ? 0.3 : 1, lineJoin: 'round', lineCap: 'round' }));
      if (hl) add(L.polyline(hl, { color: t.blue, weight: 5, opacity: 1, lineJoin: 'round', lineCap: 'round' }));
      const dot = (ll, c, r = 7) => add(L.circleMarker(ll, { radius: r, color: '#FFFFFF', weight: 3, fillColor: c, fillOpacity: 1 }));
      dot(route[0], t.green);
      dot(route[route.length - 1], t.red);
      if (hl) { dot(hl[0], t.blue, 6); dot(hl[hl.length - 1], t.blue, 6); }
      map.current.fitBounds(L.latLngBounds(hl || route), { padding: pad });
    } else if (markers && markers.length) {
      for (const m of markers) {
        add(L.circleMarker([m.lat, m.lng], { radius: m.r || 8, color: '#FFFFFF', weight: 2.5, fillColor: m.color, fillOpacity: 1 }));
      }
      if (markers.length === 1) map.current.setView([markers[0].lat, markers[0].lng], zoom);
      else map.current.fitBounds(L.latLngBounds(markers.map(m => [m.lat, m.lng])), { padding: pad, maxZoom: 15 });
    } else if (center) {
      map.current.setView(center, zoom);
    }
    setTimeout(() => map.current && map.current.invalidateSize(), 300);
  }, [key]);

  React.useEffect(() => () => { if (map.current) { map.current.remove(); map.current = null; } }, []);

  const btn = { position: 'absolute', zIndex: 1000, width: 44, height: 44, borderRadius: 22, border: 0, background: t.card, color: t.text,
    boxShadow: '0 1px 4px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 };
  return (
    <section aria-label={label} style={{ background: t.card, borderRadius: fill ? 0 : 22, overflow: 'hidden', position: 'relative', height: fill ? '100%' : height, flex: 'none' }}>
      <div ref={box} className={t.dark ? 'tm-map-dark' : ''} style={{ position: 'absolute', inset: 0, background: t.inset }}/>
      {overlay}
      {!interactive && (
        <button type="button" aria-label={tr('Mappa a tutto schermo')} data-map-expand onClick={() => setFull(true)} style={{ ...btn, top: 8, right: 8, width: 36, height: 36, borderRadius: 12 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
        </button>
      )}
      <span style={{ position: 'absolute', right: 8, bottom: fill ? 'calc(6px + env(safe-area-inset-bottom))' : 5, zIndex: 1000, fontSize: 10, color: t.sub, background: t.card, padding: '1px 5px', borderRadius: 6, opacity: 0.85 }}>© OpenStreetMap contributors</span>
      {full && ReactDOM.createPortal(
        // Portal on <body>: above the tab bar and any detail screen, whatever stacking context the small map lives in.
        <div role="dialog" aria-label={label} style={{ position: 'fixed', inset: 0, zIndex: 500, background: t.bg }}>
          <OsmMap center={center} zoom={zoom} markers={markers} route={route} highlight={highlight} overlay={overlay} label={label} interactive fill/>
          <button type="button" aria-label={tr('Chiudi mappa')} data-map-close onClick={() => setFull(false)} style={{ ...btn, top: 'calc(10px + env(safe-area-inset-top))', right: 12 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>, document.body)}
    </section>
  );
}

// ─── States: loading history, error banner, empty ───────────
function HistoryLoading() {
  const t = useT();
  return (
    <>
      <Card label={tr('Caricamento storico')} style={{ padding: '16px 18px', gap: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{tr('Carico lo storico…')}</div>
        <div aria-hidden="true" style={{ height: 6, borderRadius: 3, background: t.track, position: 'relative', overflow: 'hidden' }}>
          <div className="tm-indeterminate" style={{ position: 'absolute', top: 0, bottom: 0, width: '30%', borderRadius: 3, background: t.blue }}/>
        </div>
        <div style={{ fontSize: 13, color: t.sub }}>{tr('Stato e ricarica in corso sono già aggiornati.')}</div>
      </Card>
      <div className="tm-pulse" aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[75, 60, 70].map((w, i) => (
          <div key={i} style={{ background: t.card, borderRadius: 20, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ width: '30%', height: 18, borderRadius: 6, background: t.track }}/>
            <div style={{ width: `${w}%`, height: 14, borderRadius: 6, background: t.track }}/>
            <div style={{ height: 8, borderRadius: 4, background: t.track }}/>
          </div>
        ))}
      </div>
    </>
  );
}

function ErrorBanner({ title, text, onRetry }) {
  const t = useT();
  return (
    <section role="alert" style={{ background: t.warnBg, borderRadius: 22, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={t.warn} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}><path d="M12 3l10 18H2z M12 10v5 M12 18h.01"/></svg>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: 14, color: t.sub2, marginTop: 2, lineHeight: 1.35, wordBreak: 'break-word' }}>{text}</div>
        </div>
      </div>
      {onRetry && <button type="button" onClick={onRetry} style={{
        alignSelf: 'flex-start', minHeight: 44, padding: '0 18px', border: 0, borderRadius: 22,
        background: t.warn, color: '#FFFFFF', font: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer',
      }}>{tr('Riprova')}</button>}
    </section>
  );
}

function Empty({ icon, title, text, action, onAction }) {
  const t = useT();
  return (
    <section aria-label={tr('Nessun risultato')} style={{ marginTop: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10, padding: '0 24px' }}>
      <div style={{ width: 72, height: 72, borderRadius: 36, background: t.card, color: t.sub, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d={icon}/></svg>
      </div>
      <div style={{ fontSize: 19, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 15, color: t.sub, lineHeight: 1.4 }}>{text}</div>
      {action && <button type="button" onClick={onAction} style={{ font: 'inherit', minHeight: 44, color: t.blue, fontSize: 16, fontWeight: 600, background: 'none', border: 0, cursor: 'pointer' }}>{action}</button>}
    </section>
  );
}

// ─── Icons & tab bar ────────────────────────────────────────
const ICONS = {
  stato: 'M4 17a8 8 0 1 1 16 0 M12 17l4.5-5',
  car: 'M4 14l2-6h12l2 6v4H4z M4 14h16 M7.5 18v2 M16.5 18v2',
  bolt: 'M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12z',
  stats: 'M5 20V11 M12 20V4 M19 20v-6',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  house: 'M4 11l8-7 8 7v9H4z M10 20v-5h4v5',
  battery: 'M3 8h15v8H3z M21 11v2',
  pin: 'M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z M12 10h.01',
  download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  lock: 'M5 11h14v10H5z M8 11V8a4 4 0 0 1 8 0v3',
  shield: 'M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z',
};

const TABS = [
  { id: 'status',  label: tr('Stato'),       d: ICONS.stato },
  { id: 'drives',  label: tr('Viaggi'),      d: ICONS.car },
  { id: 'charges', label: tr('Ricariche'),   d: ICONS.bolt },
  { id: 'stats',   label: tr('Statistiche'), d: ICONS.stats },
  { id: 'more',    label: tr('Altro'),       d: ICONS.more },
];

function TabBar({ active, onChange, side }) {
  const t = useT();
  if (side) {
    return (
      <nav aria-label={tr('Navigazione principale')} style={{
        width: 230, flex: 'none', height: '100%', boxSizing: 'border-box', overflowY: 'auto',
        background: t.bar, borderRight: `0.5px solid ${t.line}`, fontFamily: FONT,
        display: 'flex', flexDirection: 'column', gap: 2,
        padding: 'calc(env(safe-area-inset-top, 0px) + 16px) 10px 16px',
      }}>
        {TABS.map(tab => {
          const on = tab.id === active;
          return (
            <button key={tab.id} type="button" aria-current={on ? 'page' : undefined} onClick={() => onChange(tab.id)} style={{
              minHeight: 46, display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', borderRadius: 12,
              font: 'inherit', background: on ? t.blueBg : 'none', border: 0, color: on ? t.blue : t.text,
              fontSize: 15, fontWeight: on ? 600 : 500, cursor: 'pointer',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={tab.id === 'more' ? 3.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}><path d={tab.d}/></svg>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    );
  }
  return (
    <nav aria-label={tr('Navigazione principale')} style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, background: t.bar,
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderTop: `0.5px solid ${t.line}`,
      padding: '6px 4px calc(env(safe-area-inset-bottom, 0px) + 4px)',
      display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', fontFamily: FONT,
      zoom: 'var(--tm-nav-zoom, 1)', // tmApplyText (theme.jsx): grows at most 15% with large text
    }}>
      {TABS.map(tab => {
        const on = tab.id === active;
        return (
          <button key={tab.id} type="button" aria-current={on ? 'page' : undefined} onClick={() => onChange(tab.id)} style={{
            minHeight: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
            font: 'inherit', background: 'none', border: 0, color: on ? t.blue : t.sub, fontSize: 10.5, fontWeight: on ? 600 : 500,
            cursor: 'pointer', padding: 0,
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={tab.id === 'more' ? 3.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={tab.d}/></svg>
            <span style={{ fontSize: 10.5 }}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

Object.assign(window, {
  fmtN, fmtMoney, CUR, fmtMin, hhmm, dayLabel, dayShort, sinceLabel, agoLabel, linFit,
  PERIOD_KINDS, periodRange, inPeriod, PeriodBar,
  Screen, CarSwitch, Title, Card, CardHead, BackLink, NavArrows, Stat, Grid, Divider, Seg, Chips, Bar, SocBar, Row, ListCard,
  SectionLabel, useWidth, useLayout, LineChart, Scatter, AxisLabels, OsmMap, HistoryLoading, ErrorBanner, Empty,
  ICONS, TABS, TabBar, saveCsv, csvName, csvStamp, ExportButton,
});
