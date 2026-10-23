// ─────────────────────────────────────────────────────────────
// Theme tokens from the Claude Design restyling (docs/design/), iOS-like.
// Theme: chosen on this device (Altro → Questo dispositivo), else config.js `theme`, else the system setting.
// ─────────────────────────────────────────────────────────────

const TM_THEMES = {
  light: {
    dark: false,
    bg: '#F2F2F7', card: '#FFFFFF', inset: '#F2F2F7', inset2: '#E3E3E8', seg: '#FFFFFF',
    text: '#000000', sub: '#6C6C70', sub2: '#3C3C43', line: 'rgba(60,60,67,0.2)', track: '#E5E5EA',
    green: '#248A3D', greenBg: 'rgba(52,199,89,0.15)',
    blue: '#0A66D6', blueBg: 'rgba(10,132,255,0.12)', blueSoft: 'rgba(10,102,214,0.3)',
    orange: '#C45A00', orangeBg: 'rgba(255,149,0,0.16)', warnBg: '#FFEBD6', warn: '#B85400',
    red: '#D70015', purple: '#8944AB',
    chipOn: '#000000', chipOnFg: '#FFFFFF',
    bar: 'rgba(249,249,249,0.94)',
    iconGreen: '#248A3D', iconRed: '#D70015', iconGray: '#636366',
  },
  dark: {
    dark: true,
    bg: '#000000', card: '#1C1C1E', inset: '#2C2C2E', inset2: '#2C2C2E', seg: '#636366',
    text: '#FFFFFF', sub: '#A1A1A6', sub2: '#D1D1D6', line: 'rgba(84,84,88,0.6)', track: '#3A3A3C',
    green: '#30D158', greenBg: 'rgba(48,209,88,0.18)',
    blue: '#409CFF', blueBg: 'rgba(64,156,255,0.18)', blueSoft: 'rgba(64,156,255,0.35)',
    orange: '#FF9F0A', orangeBg: 'rgba(255,159,10,0.18)', warnBg: '#3A2610', warn: '#C25E00',
    red: '#FF453A', purple: '#BF5AF2',
    chipOn: '#FFFFFF', chipOnFg: '#000000',
    bar: 'rgba(22,22,24,0.94)',
    iconGreen: '#248A3D', iconRed: '#D70015', iconGray: '#636366',
  },
};

// Text size: device choice (%), else config.js `textSize`, else on iPhone/iPad the system text size
// (Dynamic Type, 17 px = default). The whole app scales (CSS zoom), so icons and spacing keep their proportions.
const TM_TEXT_SCALE = (() => {
  const c = tmChoice('textSize', ['100', '115', '130', '150']);
  if (c) return +c / 100;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios || !CSS.supports('font', '-apple-system-body')) return 1; // Mac: -apple-system-body is 13 px, not a choice
  const el = document.createElement('span');
  el.style.font = '-apple-system-body';
  document.body.appendChild(el);
  const px = parseFloat(getComputedStyle(el).fontSize);
  el.remove();
  return px ? Math.min(1.6, Math.max(0.85, px / 17)) : 1;
})();
if (TM_TEXT_SCALE !== 1) document.documentElement.style.zoom = String(TM_TEXT_SCALE);

const TMTheme = React.createContext(TM_THEMES.light);
const useT = () => React.useContext(TMTheme);

function useSystemTheme() {
  const mq = React.useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), []);
  const [dark, setDark] = React.useState(mq.matches);
  React.useEffect(() => {
    const on = (e) => setDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [mq]);
  const forced = tmChoice('theme', ['light', 'dark']);
  const t = (forced ? forced === 'dark' : dark) ? TM_THEMES.dark : TM_THEMES.light;
  // Page background and browser bar follow too (the CSS only knows the system setting).
  React.useEffect(() => {
    document.documentElement.style.background = document.body.style.background = t.bg;
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', t.bg));
  }, [t]);
  return t;
}

Object.assign(window, { TM_THEMES, TM_TEXT_SCALE, TMTheme, useT, useSystemTheme });
