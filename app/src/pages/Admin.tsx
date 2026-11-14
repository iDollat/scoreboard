import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useAdmin } from '../lib/admin';
import { useMatches, usePlayers, useSettings } from '../lib/data';
import { Loading, errorText, useUI } from '../lib/ui';
import { plural } from '../lib/format';
import { allSeasons } from '../components';

export default function Admin() {
  const { isAdmin, checking, login, logout } = useAdmin();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (checking) return <Loading />;
  if (!isAdmin) return <section className="card">
    <h2 className="card-title">🔒 Logowanie administratora</h2>
    <p className="muted small">Administrator planuje mecze, układa składy i prowadzi wynik na żywo. Zawodnicy nie potrzebują konta – zapisują się z linku.</p>
    <form className="stack-form" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setErr(null);
      try { const e2 = await login(pw); if (e2) setErr(e2); else setPw(''); }
      catch (e3) { setErr(errorText(e3)); } finally { setBusy(false); }
    }}>
      <label>Hasło<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required /></label>
      {err && <p className="error-text">⚠️ {err}</p>}
      <button className="btn primary big" disabled={busy}>{busy ? 'Logowanie…' : 'Zaloguj'}</button>
    </form>
  </section>;
  return <AdminPanel logout={logout} />;
}

function AdminPanel({ logout }: { logout: () => void }) {
  const { token } = useAdmin();
  const settings = useSettings();
  const matches = useMatches();
  const { players } = usePlayers();
  const { toast, ask, confirm } = useUI();
  const setSeason = useMutation(api.settings.setSeason);
  const addPlayer = useMutation(api.players.add);
  const rename = useMutation(api.players.rename);
  const removePlayer = useMutation(api.players.remove);
  const [name, setName] = useState('');
  const apps = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of matches ?? []) for (const pid in m.lineup) c[pid] = (c[pid] || 0) + 1;
    return c;
  }, [matches]);
  if (!settings || !matches) return <Loading />;
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) toast(ok); } catch (e) { toast('⚠️ ' + errorText(e)); }
  };

  return <>
    <section className="card">
      <div className="card-head"><h2 className="card-title">🔑 Administrator</h2><button type="button" className="link" onClick={logout}>Wyloguj</button></div>
      <div className="org-actions">
        <Link className="btn primary" to="/terminy">📅 Terminy</Link>
        <Link className="btn" to="/mecz">⚽ Mecz na żywo</Link>
      </div>
    </section>

    <section className="card">
      <h2 className="card-title">Sezon</h2>
      <p className="muted small">Nowe mecze zapisują się do bieżącego sezonu.</p>
      <div className="inline-form">
        <select value={settings.season} onChange={(e) => run(() => setSeason({ token: token!, season: e.target.value }), `Bieżący sezon: ${e.target.value}`)}>
          {allSeasons(settings, matches).map((s) => <option key={s}>{s}</option>)}
        </select>
        <button type="button" className="btn" onClick={async () => {
          const v = await ask('Nazwa nowego sezonu', '', 'np. 2027 albo Wiosna 2027');
          if (v) run(() => setSeason({ token: token!, season: v }), `Bieżący sezon: ${v}`);
        }}>+ Nowy sezon</button>
      </div>
    </section>

    <section className="card">
      <h2 className="card-title">Zawodnicy <span className="muted">({players.length})</span></h2>
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (name.trim()) run(() => addPlayer({ token: token!, name }), `Dodano: ${name.trim()}`).then(() => setName('')); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Imię zawodnika" maxLength={40} autoComplete="off" />
        <button className="btn">Dodaj</button>
      </form>
      <ul className="roster">{players.map((p) => <li key={p._id}>
        <span>{p.name} <span className="muted small">{apps[p._id] ? `· ${apps[p._id]} ${plural(apps[p._id], 'mecz', 'mecze', 'meczów')}` : ''}</span></span>
        <span>
          <button type="button" className="icon-btn" aria-label="Zmień imię" onClick={async () => {
            const v = await ask('Zmień imię', p.name);
            if (!v || v === p.name) return;
            const dup = players.find((x) => x._id !== p._id && x.name.toLocaleLowerCase('pl') === v.toLocaleLowerCase('pl'));
            if (dup && !(await confirm(`Połączyć z „${dup.name}”?`, `Mecze, gole i zapisy „${p.name}” zostaną przepisane na „${dup.name}”.`, 'Połącz', 'primary'))) return;
            run(() => rename({ token: token!, id: p._id as Id<'players'>, name: v }), dup ? `Połączono z: ${dup.name}` : undefined);
          }}>✎</button>
          <button type="button" className="icon-btn" aria-label="Usuń" onClick={async () => {
            if (!(await confirm(`Usunąć ${p.name}?`, '', '🗑 Usuń'))) return;
            run(() => removePlayer({ token: token!, id: p._id as Id<'players'> }));
          }}>🗑</button>
        </span>
      </li>)}</ul>
      <p className="muted small">Literówka w imieniu? Zmień imię na już istniejące, a zawodnicy zostaną połączeni razem ze statystykami.</p>
    </section>
  </>;
}
