export const now = () => Date.now();

// Local-timezone day key: '2026-08-28'. Dailies key off this.
export function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Debug/date-override aware "today" — override lives in sessionStorage so
// it is tab-scoped and can't leak into real play.
export function todayKey() {
  return sessionStorage.getItem('cpl.dateOverride') || dateKey();
}

export function fmtMMSS(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function relTime(ts) {
  const d = now() - ts;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}
