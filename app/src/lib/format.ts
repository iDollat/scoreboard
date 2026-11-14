export const plural = (n: number, one: string, few: string, many: string) => {
  if (n === 1) return one;
  const d = n % 10, h = n % 100;
  return d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many;
};
export const goalsWord = (n: number) => `${n} ${plural(n, 'gol', 'gole', 'goli')}`;
export const norm = (s: string) => String(s || '').trim().replace(/\s+/g, ' ');
export const nameKey = (s: string) => norm(s).toLocaleLowerCase('pl').normalize('NFC');
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const fmtDate = (ts: number, opts?: Intl.DateTimeFormatOptions) =>
  new Date(ts).toLocaleDateString('pl-PL', opts ?? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const fmtClock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
export const minute = (ms: number) => `${Math.floor(ms / 60000) + 1}'`;

export function gameWhen(g: { date: string; time: string }, long = true) {
  const d = new Date(`${g.date}T${g.time || '12:00'}`);
  const day = d.toLocaleDateString(
    'pl-PL',
    long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' },
  );
  const s = `${day}${g.time ? `, ${g.time}` : ''}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/* Udostępnianie: systemowe menu (np. WhatsApp), a gdy go nie ma – schowek */
export async function shareOrCopy(text: string, toast: (m: string) => void) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); toast('📋 Skopiowano – wklej np. na grupę'); }
  catch { window.prompt('Skopiuj tekst:', text); }
}
export const buzz = () => navigator.vibrate?.(35);
