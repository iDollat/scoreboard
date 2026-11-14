import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useAdmin } from '../lib/admin';
import { useMatches, usePlayers, useSettings } from '../lib/data';
import { useLive, useLiveSync, type LiveMatch } from '../lib/live';
import { beneficiary, elapsed, other, playerGoals, score, switchedIn, type Team } from '../lib/stats';
import { Empty, Loading, Sheet, errorText, useUI } from '../lib/ui';
import { buzz, fmtClock, gameWhen, goalsWord, nameKey, norm, uid } from '../lib/format';
import { EventRow } from '../components';

export default function Live() {
  const { isAdmin, checking, token } = useAdmin();
  const { live } = useLive();
  const sync = useLiveSync(token);
  if (checking) return <Loading />;
  if (!isAdmin) return <Empty action={<Link className="btn primary" to="/admin">Zaloguj się</Link>}>Mecz na żywo prowadzi administrator.</Empty>;
  return live ? <LiveBoard live={live} sync={sync} /> : <Setup />;
}

/* Ref zawodnika: prawdziwe id albo "new:Imię" (gdy nie ma go jeszcze w bazie) */
function useRefFor() {
  const { players } = usePlayers();
  return (name: string) => {
    const n = norm(name);
    const p = players.find((x) => nameKey(x.name) === nameKey(n));
    return p ? (p._id as string) : `new:${n}`;
  };
}

/* ---------- Przygotowanie meczu ---------- */
function Setup() {
  const { players, nameOf } = usePlayers();
  const matches = useMatches();
  const settings = useSettings();
  const games = useQuery(api.games.list);
  const { start } = useLive();
  const { toast } = useUI();
  const refFor = useRefFor();
  const [teams, setTeams] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hala.draft') || '') as { A: string; B: string; lineup: Record<string, Team> }; }
    catch { return { A: 'Biali', B: 'Czarni', lineup: {} as Record<string, Team> }; }
  });
  const [newName, setNewName] = useState('');
  useEffect(() => { localStorage.setItem('hala.draft', JSON.stringify(teams)); }, [teams]);

  const apps = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of matches ?? []) for (const pid in m.lineup) c[pid] = (c[pid] || 0) + 1;
    return c;
  }, [matches]);
  if (!matches || !settings) return <Loading />;

  const ids = [...new Set([...players.map((p) => p._id as string), ...Object.keys(teams.lineup)])]
    .sort((a, b) => (apps[b] || 0) - (apps[a] || 0) || nameOf(a).localeCompare(nameOf(b), 'pl'));
  const cycle = (pid: string) => {
    const lineup = { ...teams.lineup };
    const t = lineup[pid];
    if (!t) lineup[pid] = 'A'; else if (t === 'A') lineup[pid] = 'B'; else delete lineup[pid];
    setTeams({ ...teams, lineup });
  };
  const chip = (pid: string) => <button key={pid} type="button" className={`chip ${teams.lineup[pid] ? 'on-' + teams.lineup[pid] : ''}`} onClick={() => cycle(pid)}>{nameOf(pid)}</button>;
  const group = (t: Team) => {
    const list = ids.filter((p) => teams.lineup[p] === t);
    return <div className="lineup-group"><div className={`group-label t-${t}`}><span className="dot" />{teams[t]} <span className="muted">({list.length})</span></div>
      <div className="chips">{list.length ? list.map(chip) : <span className="muted small">brak zawodników</span>}</div></div>;
  };
  const bench = ids.filter((p) => !teams.lineup[p]);
  const planned = (games ?? []).find((g) => g.teams && Object.keys(g.teams.lineup).length);

  const begin = (extra?: Partial<LiveMatch>) => {
    const now = Date.now();
    start({
      clientId: uid(), season: settings.season, status: 'live', startedAt: now, pausedMs: 0,
      teams: { A: norm(teams.A) || 'Drużyna A', B: norm(teams.B) || 'Drużyna B' }, lineup: { ...teams.lineup }, events: [],
      rev: 1, syncedRev: 0, ...extra,
    });
  };

  return <>
    {planned && <button type="button" className="banner" onClick={() => begin({ gameId: planned._id, teams: { A: planned.teams!.A, B: planned.teams!.B }, lineup: { ...planned.teams!.lineup } })}>
      <span>⚖️ Są ułożone składy na {gameWhen(planned, false)}</span><b>Zacznij ›</b></button>}
    <section className="card">
      <h2 className="card-title">Nowy mecz</h2>
      <div className="vs-inputs">
        <input className="team-input t-A" value={teams.A} maxLength={20} onChange={(e) => setTeams({ ...teams, A: e.target.value })} />
        <span className="vs">vs</span>
        <input className="team-input t-B" value={teams.B} maxLength={20} onChange={(e) => setTeams({ ...teams, B: e.target.value })} />
      </div>
    </section>
    <section className="card">
      <div className="card-head"><h2 className="card-title">Składy</h2>
        <div className="mini-actions">
          <button type="button" className="link" onClick={() => {
            const sel = Object.keys(teams.lineup);
            if (sel.length < 2) return toast('Najpierw dodaj zawodników do drużyn');
            for (let i = sel.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [sel[i], sel[j]] = [sel[j], sel[i]]; }
            const first: Team = Math.random() < 0.5 ? 'A' : 'B';
            setTeams({ ...teams, lineup: Object.fromEntries(sel.map((p, i) => [p, i % 2 ? other(first) : first])) });
          }}>🎲 Losuj</button>
          <button type="button" className="link" onClick={() => {
            const last = matches.find((m) => m.status === 'done');
            if (!last) return toast('Brak poprzedniego meczu');
            setTeams({ A: last.teams.A, B: last.teams.B, lineup: { ...last.lineup } });
          }}>↺ Jak ostatnio</button>
        </div></div>
      <p className="muted small">Dotknij zawodnika, żeby przenieść go do kolejnej drużyny albo poza mecz.</p>
      {group('A')}{group('B')}
      {bench.length > 0 && <div className="lineup-group"><div className="group-label"><span className="dot" />Poza meczem <span className="muted">({bench.length})</span></div><div className="chips">{bench.map(chip)}</div></div>}
      <form className="inline-form" onSubmit={(e) => {
        e.preventDefault();
        if (!norm(newName)) return;
        const ref = refFor(newName);
        const c = { A: 0, B: 0 };
        Object.values(teams.lineup).forEach((t) => c[t]++);
        setTeams({ ...teams, lineup: { ...teams.lineup, [ref]: teams.lineup[ref] ?? (c.A <= c.B ? 'A' : 'B') } });
        setNewName('');
      }}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nowy zawodnik…" maxLength={40} autoComplete="off" />
        <button className="btn">Dodaj</button>
      </form>
    </section>
    <button type="button" className="btn primary big block" onClick={() => begin()}>▶ Rozpocznij mecz</button>
    <p className="muted small center">Wynik widać na żywo u wszystkich. Bez zasięgu mecz zapisuje się na telefonie i wyśle się później.</p>
  </>;
}

/* ---------- Mecz na żywo ---------- */
function LiveBoard({ live: m, sync }: { live: LiveMatch; sync: { pending: boolean; error: string | null } }) {
  const { update, clear, start } = useLive();
  const { nameOf, players } = usePlayers();
  const { token } = useAdmin();
  const { toast, choose, ask } = useUI();
  const refFor = useRefFor();
  const remove = useMutation(api.matches.remove);
  const nav = useNavigate();
  const [, tick] = useState(0);
  const [quick, setQuick] = useState('');
  const [addTo, setAddTo] = useState<Team | null>(null);
  const [bump, setBump] = useState<Team | null>(null);
  const finishing = useRef(false);

  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  // ekran nie gaśnie podczas meczu
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const get = () => { navigator.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {}); };
    get();
    const vis = () => { if (document.visibilityState === 'visible') get(); };
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); lock?.release().catch(() => {}); };
  }, []);
  // po zakończeniu – gdy wynik jest już na serwerze – pokaż podsumowanie
  useEffect(() => {
    if (m.status === 'done' && m.syncedRev >= m.rev && m.serverId) {
      const id = m.serverId;
      clear();
      nav(`/historia/${id}?nowy=1`);
    }
  }, [m, clear, nav]);

  const s = score(m);
  /* zmiana z możliwością cofnięcia */
  const change = (label: string | (() => string), fn: (x: LiveMatch) => LiveMatch) => {
    const before = { events: m.events, lineup: m.lineup };
    update(fn);
    buzz();
    toast(typeof label === 'function' ? label() : label, () => update((x) => ({ ...x, ...before })));
  };
  const goal = (pid: string, own = false, forceTeam?: Team) => {
    const wasIn = pid in m.lineup;
    const moved = wasIn && forceTeam && m.lineup[pid] !== forceTeam;
    const team = (wasIn && !moved ? m.lineup[pid] : forceTeam)!;
    const ev = { id: uid(), type: 'goal' as const, pid, team, own, t: elapsed(m) };
    const after = score({ ...m, events: [...m.events, ev] });
    change(`${own ? '🙈 Samobój' : '⚽ Gol'}: ${nameOf(pid)}${moved ? ` (teraz gra w: ${m.teams[forceTeam!]})` : ''} · ${after.A}:${after.B}`, (x) => {
      const events = [...x.events];
      const lineup = { ...x.lineup };
      if (moved) events.push({ id: uid(), type: 'switch', pid, from: lineup[pid], to: forceTeam!, t: elapsed(x) });
      lineup[pid] = team;
      return { ...x, lineup, events: [...events, ev] };
    });
    setBump(beneficiary(ev));
    setTimeout(() => setBump(null), 460);
  };
  const switchTeam = (pid: string) => change(`⇄ ${nameOf(pid)} gra teraz w: ${m.teams[other(m.lineup[pid])]}`, (x) => ({
    ...x, lineup: { ...x.lineup, [pid]: other(x.lineup[pid]) },
    events: [...x.events, { id: uid(), type: 'switch', pid, from: x.lineup[pid], to: other(x.lineup[pid]), t: elapsed(x) }],
  }));
  const deleteEvent = (id: string) => {
    const e = m.events.find((x) => x.id === id);
    if (!e) return;
    change(e.type === 'goal' ? `Usunięto gola: ${nameOf(e.pid)}` : `Cofnięto zmianę drużyny: ${nameOf(e.pid)}`, (x) => {
      const lineup = { ...x.lineup };
      if (e.type === 'switch' && lineup[e.pid] === e.to) lineup[e.pid] = e.from!;
      return { ...x, lineup, events: x.events.filter((y) => y.id !== id) };
    });
  };
  const menu = async (pid: string) => {
    const t = m.lineup[pid];
    const { g, o } = playerGoals(m, pid);
    const opts: { label: string; value: string; cls?: string }[] = [
      { label: '⚽ Gol', value: 'goal', cls: 'primary' },
      { label: `🙈 Samobój (gol dla: ${m.teams[other(t)]})`, value: 'own' },
      { label: `⇄ Przenieś do: ${m.teams[other(t)]}`, value: 'switch' },
    ];
    if (!g && !o) opts.push({ label: 'Usuń z meczu', value: 'remove', cls: 'ghost danger-text' });
    const a = await choose(nameOf(pid), `${m.teams[t]} · ${goalsWord(g)}${o ? ` · samobóje: ${o}` : ''}`, opts);
    if (a === 'goal') goal(pid);
    else if (a === 'own') goal(pid, true);
    else if (a === 'switch') switchTeam(pid);
    else if (a === 'remove') change(`${nameOf(pid)} usunięty z meczu`, (x) => {
      const lineup = { ...x.lineup }; delete lineup[pid];
      return { ...x, lineup, events: x.events.filter((e) => e.pid !== pid) };
    });
  };
  const finish = async () => {
    const a = await choose('Zakończyć mecz?', `${m.teams.A} ${s.A} : ${s.B} ${m.teams.B}`, [
      { label: '🏁 Zakończ i zapisz', value: 'save', cls: 'primary' },
      ...(m.events.length ? [] : [{ label: 'Odrzuć mecz (nie zapisuj)', value: 'discard', cls: 'ghost danger-text' }]),
    ]);
    if (a === 'discard') {
      if (m.serverId) remove({ token: token!, id: m.serverId as Id<'matches'> }).catch((e) => toast('⚠️ ' + errorText(e)));
      clear(); return;
    }
    if (a !== 'save') return;
    finishing.current = true;
    const now = Date.now();
    update((x) => ({ ...x, status: 'done', endedAt: now, pausedMs: x.pausedMs + (x.pausedAt ? now - x.pausedAt : 0), pausedAt: undefined }));
  };

  const column = (t: Team) => {
    const pids = Object.keys(m.lineup).filter((p) => m.lineup[p] === t)
      .map((pid) => ({ pid, ...playerGoals(m, pid) }))
      .sort((a, b) => b.g - a.g || nameOf(a.pid).localeCompare(nameOf(b.pid), 'pl'));
    return <div className={`col t-${t}`}>
      <div className="col-head"><span className="dot" /><span className="col-name">{m.teams[t]}</span><span className="muted">{pids.length}</span></div>
      {pids.map(({ pid, g, o }) => <div key={pid} className="prow" role="button" tabIndex={0} onClick={() => goal(pid)}>
        <span className="pname">{nameOf(pid)}{switchedIn(m, pid) && <span className="swap"> ⇄</span>}</span>
        <span className="pgoals">{g ? `⚽${g > 1 ? g : ''}` : ''}{o ? <span className="own"> 🙈{o > 1 ? o : ''}</span> : null}</span>
        <button type="button" className="pmore" aria-label="Opcje" onClick={(e) => { e.stopPropagation(); menu(pid); }}>⋯</button>
      </div>)}
      <button type="button" className="add-row" onClick={() => setAddTo(t)}>+ zawodnik</button>
    </div>;
  };

  const runs: Record<string, string> = {};
  { const r = { A: 0, B: 0 }; for (const e of m.events) if (e.type === 'goal') { r[beneficiary(e)]++; runs[e.id] = `${r.A}:${r.B}`; } }

  if (m.status === 'done') return <Empty>
    {sync.error ? <>⚠️ Nie udało się zapisać wyniku: {errorText(sync.error)}<br />Ponawiam…</> : 'Zapisywanie wyniku… Bez zasięgu wynik wyśle się, gdy wróci internet.'}
    <br /><button type="button" className="btn ghost" style={{ marginTop: 12 }} onClick={() => start({ ...m, status: 'live', endedAt: undefined, pausedAt: Date.now(), rev: m.rev + 1 })}>↺ Wróć do meczu</button>
  </Empty>;

  return <>
    <section className={`board ${m.pausedAt ? 'paused' : ''}`}>
      <button type="button" className="board-team t-A" onClick={async () => { const v = await ask('Nazwa drużyny', m.teams.A); if (v) update((x) => ({ ...x, teams: { ...x.teams, A: v } })); }}>{m.teams.A}</button>
      <div className="board-clock">
        <span className="clock">{fmtClock(elapsed(m))}</span>
        <button type="button" className="pause" onClick={() => update((x) => x.pausedAt
          ? { ...x, pausedMs: x.pausedMs + (Date.now() - x.pausedAt), pausedAt: undefined }
          : { ...x, pausedAt: Date.now() })}>{m.pausedAt ? '▶ wznów' : '❚❚ pauza'}</button>
      </div>
      <button type="button" className="board-team t-B" onClick={async () => { const v = await ask('Nazwa drużyny', m.teams.B); if (v) update((x) => ({ ...x, teams: { ...x.teams, B: v } })); }}>{m.teams.B}</button>
      <div className={`board-score t-A ${bump === 'A' ? 'bump' : ''}`}>{s.A}</div>
      <div className="board-sep">:</div>
      <div className={`board-score t-B ${bump === 'B' ? 'bump' : ''}`}>{s.B}</div>
      <div className={`sync-dot ${sync.pending ? 'pending' : 'ok'}`} title={sync.pending ? 'Wysyłanie…' : 'Zapisane – widoczne dla wszystkich'} />
    </section>

    <form className="quick card" autoComplete="off" onSubmit={(e) => {
      e.preventDefault();
      const ref = refFor(quick);
      if (!norm(quick)) return;
      if (ref in m.lineup) { goal(ref); setQuick(''); } else toast('Wybierz drużynę – przycisk ⚽ poniżej');
    }}>
      <input value={quick} onChange={(e) => setQuick(e.target.value)} list="roster" placeholder="Kto strzelił? Wpisz imię…" maxLength={40} enterKeyHint="go" />
      <datalist id="roster">{players.map((p) => <option key={p._id} value={p.name} />)}</datalist>
      <div className="quick-btns">
        {(['A', 'B'] as Team[]).map((t) => <button key={t} type="button" className={`btn team t-${t}`} onClick={() => {
          if (!norm(quick)) return toast('Wpisz imię strzelca');
          goal(refFor(quick), false, t); setQuick('');
        }}>⚽ {m.teams[t]}</button>)}
      </div>
    </form>

    <section className="cols">{column('A')}{column('B')}</section>
    <p className="muted small center">Dotknij zawodnika = gol. <b>⋯</b> = samobój, zmiana drużyny.</p>

    <section className="card">
      <div className="card-head"><h2 className="card-title">Przebieg</h2>
        {m.events.length > 0 && <button type="button" className="link" onClick={() => deleteEvent(m.events[m.events.length - 1].id)}>↶ Cofnij ostatnie</button>}</div>
      {m.events.length ? <ul className="events">{[...m.events].reverse().map((e) =>
        <EventRow key={e.id} m={m} e={e} nameOf={nameOf} run={runs[e.id]} onDelete={() => deleteEvent(e.id)} />)}</ul>
        : <p className="muted small">Jeszcze nic się nie wydarzyło.</p>}
    </section>

    <button type="button" className="btn danger block" onClick={finish}>🏁 Zakończ mecz</button>
    <p className="muted small center">{sync.error ? `⚠️ ${errorText(sync.error)} – ponawiam` : sync.pending ? '🔄 Wysyłanie… (bez zasięgu wyśle się później)' : '🟢 Wynik widoczny dla wszystkich'}</p>

    <AddToTeam team={addTo} onClose={() => setAddTo(null)} m={m} onAdd={(ref, t) => {
      if (m.lineup[ref] && m.lineup[ref] !== t) switchTeam(ref);
      else if (!m.lineup[ref]) update((x) => ({ ...x, lineup: { ...x.lineup, [ref]: t } }));
    }} refFor={refFor} />
  </>;
}

function AddToTeam({ team, onClose, m, onAdd, refFor }: {
  team: Team | null; onClose: () => void; m: LiveMatch; onAdd: (ref: string, t: Team) => void; refFor: (n: string) => string;
}) {
  const { players } = usePlayers();
  const [name, setName] = useState('');
  const avail = players.filter((p) => !(p._id in m.lineup));
  return <Sheet open={!!team} onClose={onClose}>
    {team && <>
      <h3>Dodaj do: {m.teams[team]}</h3>
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (!norm(name)) return; onAdd(refFor(name), team); setName(''); onClose(); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Imię zawodnika" maxLength={40} autoComplete="off" />
        <button className="btn primary">Dodaj</button>
      </form>
      {avail.length > 0 && <>
        <p className="muted small">Albo wybierz z listy (możesz kilku):</p>
        <div className="chips">{avail.map((p) => <button key={p._id} type="button" className="chip" onClick={() => onAdd(p._id, team)}>{p.name}</button>)}</div>
      </>}
    </>}
  </Sheet>;
}
