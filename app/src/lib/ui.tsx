import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';

/* ---------- Wysuwane od dołu okienko ---------- */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!open) { setShown(false); return; }
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className={`sheet ${shown ? 'open' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet-panel" role="dialog">
        <div className="sheet-grip" />
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Toast + okna wyboru ---------- */
type Option<T> = { label: string; value: T; cls?: string };
type UI = {
  toast: (msg: string, undo?: () => void) => void;
  choose: <T>(title: string, text: string, options: Option<T>[]) => Promise<T | null>;
  confirm: (title: string, text: string, label?: string, cls?: string) => Promise<boolean>;
  ask: (title: string, value?: string, placeholder?: string) => Promise<string | null>;
};
const Ctx = createContext<UI>(null as never);
export const useUI = () => useContext(Ctx);

type Dialog =
  | { kind: 'choose'; title: string; text: string; options: Option<unknown>[]; resolve: (v: unknown) => void }
  | { kind: 'ask'; title: string; value: string; placeholder: string; resolve: (v: string | null) => void };

export function UIProvider({ children }: { children: ReactNode }) {
  const [toastState, setToast] = useState<{ msg: string; undo?: () => void; id: number } | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const timer = useRef<number>(0);
  const loc = useLocation();

  // „Cofnij” z poprzedniego ekranu nie może działać po przejściu dalej
  useEffect(() => { setToast(null); }, [loc.pathname]);

  const toast = useCallback((msg: string, undo?: () => void) => {
    clearTimeout(timer.current);
    setToast({ msg, undo, id: Date.now() });
    timer.current = window.setTimeout(() => setToast(null), undo ? 5000 : 2600);
  }, []);
  const choose = useCallback(<T,>(title: string, text: string, options: Option<T>[]) =>
    new Promise<T | null>((resolve) => setDialog({ kind: 'choose', title, text, options: options as Option<unknown>[], resolve: resolve as (v: unknown) => void })), []);
  const confirm = useCallback((title: string, text: string, label = 'Tak', cls = 'danger') =>
    choose(title, text, [{ label, value: true, cls }]).then((v) => !!v), [choose]);
  const ask = useCallback((title: string, value = '', placeholder = '') =>
    new Promise<string | null>((resolve) => setDialog({ kind: 'ask', title, value, placeholder, resolve })), []);

  const close = (v: unknown) => { if (!dialog) return; (dialog.resolve as (x: unknown) => void)(v); setDialog(null); };

  return (
    <Ctx.Provider value={{ toast, choose, confirm, ask }}>
      {children}
      <div className={`toast ${toastState ? 'show' : ''}`} role="status" aria-live="polite">
        {toastState && <>
          <span>{toastState.msg}</span>
          {toastState.undo && <button type="button" onClick={() => { toastState.undo!(); setToast(null); }}>Cofnij</button>}
        </>}
      </div>
      <Sheet open={!!dialog} onClose={() => close(null)}>
        {dialog?.kind === 'choose' && <>
          <h3>{dialog.title}</h3>
          {dialog.text && <p className="muted">{dialog.text}</p>}
          <div className="sheet-actions">
            {dialog.options.map((o, i) => <button key={i} type="button" className={`btn ${o.cls ?? ''}`} onClick={() => close(o.value)}>{o.label}</button>)}
            <button type="button" className="btn ghost" onClick={() => close(null)}>Anuluj</button>
          </div>
        </>}
        {dialog?.kind === 'ask' && <AskForm key={dialog.title} dialog={dialog} onDone={close} />}
      </Sheet>
    </Ctx.Provider>
  );
}

function AskForm({ dialog, onDone }: { dialog: Extract<Dialog, { kind: 'ask' }>; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(dialog.value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => { ref.current?.focus(); ref.current?.select(); }, 80); return () => clearTimeout(t); }, []);
  return <>
    <h3>{dialog.title}</h3>
    <form className="inline-form" onSubmit={(e) => { e.preventDefault(); onDone(v.trim().replace(/\s+/g, ' ') || null); }}>
      <input ref={ref} value={v} onChange={(e) => setV(e.target.value)} placeholder={dialog.placeholder} maxLength={40} autoComplete="off" />
      <button className="btn primary">OK</button>
    </form>
  </>;
}

/* ---------- Drobne komponenty ---------- */
export const Empty = ({ children, action }: { children: ReactNode; action?: ReactNode }) =>
  <div className="empty"><div className="empty-ball">⚽</div><p>{children}</p>{action}</div>;
export const Loading = () => <Empty>Wczytywanie…</Empty>;

/* Wynik mutacji z czytelnym błędem */
export function errorText(e: unknown) {
  const m = (e as Error)?.message ?? String(e);
  const hit = m.match(/Uncaught Error: (.*?)(\n|$)/);
  return hit ? hit[1] : m.replace(/^\[.*?\]\s*/, '').split('\n')[0];
}

export function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const root = document.getElementById('confetti');
  if (!root) return;
  const colors = ['#22c55e', '#38bdf8', '#f97316', '#facc15', '#f472b6', '#ffffff'];
  root.innerHTML = Array.from({ length: 90 }, (_, i) =>
    `<i style="left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${(Math.random() * 0.7).toFixed(2)}s;animation-duration:${(2.2 + Math.random() * 1.6).toFixed(2)}s;width:${6 + Math.random() * 6}px"></i>`).join('');
  setTimeout(() => { root.innerHTML = ''; }, 4500);
}
