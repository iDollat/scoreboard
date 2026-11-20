import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Doc, Id } from '../../convex/_generated/dataModel';
import { useAdmin } from '../lib/admin';
import { getMe, setMe, usePlayers } from '../lib/data';
import { Empty, Loading, Sheet, errorText, useUI } from '../lib/ui';
import { buzz, gameWhen, plural, shareOrCopy } from '../lib/format';
import { GameForm } from './Games';
import SignupPicker from './SignupPicker';
import { LOCAL_ID, getShadow, isBlockedName, setShadow, shadowSignup } from '../lib/blocked';

type Status = 'in' | 'maybe' | 'out';
const LABEL: Record<Status, string> = { in: '✅ Gram', maybe: '🤔 Może', out: '❌ Nie gram' };

export default function Game() {
  const { id = '' } = useParams();
  const game = useQuery(api.games.get, { id });
  const { players, nameOf: dbName } = usePlayers();
  const { isAdmin, token } = useAdmin();
  const { toast, choose, confirm } = useUI();
  const signup = useMutation(api.games.signup);
  const adminSignup = useMutation(api.games.adminSignup);
  const cancel = useMutation(api.games.cancel);
  const nav = useNavigate();
  const [meId, setMeId] = useState(getMe);
  const [shadow, setShadowState] = useState(getShadow); // zapis „żartem” – tylko na tym telefonie
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  if (game === undefined) return <Loading />;
  if (game === null || game.status === 'cancelled') return <Empty action={<Link className="btn primary" to="/terminy">Zobacz terminy</Link>}>Ten mecz nie istnieje albo został odwołany.</Empty>;

  const realMe = meId && players.some((p) => p._id === meId) ? meId : null;
  const me = realMe ?? (shadow ? LOCAL_ID : null);
  const nameOf = (id: string) => (id === LOCAL_ID ? shadow?.name ?? '?' : dbName(id));
  // lokalny zapis dokładamy do listy tylko na tym telefonie – w bazie go nie ma
  const local = !realMe && shadow?.games[game._id];
  const signups = local
    ? [...game.signups, { _id: LOCAL_ID, playerId: LOCAL_ID, gameId: game._id, status: local.status, by: 'self', at: local.at } as unknown as Doc<'signups'>]
      .sort((a, b) => a.at - b.at)
    : game.signups;
  const mine = me ? signups.find((s) => s.playerId === me) : undefined;
  const ins = signups.filter((s) => s.status === 'in');
  const limit = game.limit || 0;
  const G = {
    in: limit ? ins.slice(0, limit) : ins,
    reserve: limit ? ins.slice(limit) : [],
    maybe: signups.filter((s) => s.status === 'maybe'),
    out: signups.filter((s) => s.status === 'out'),
  };
  const open = game.status === 'open';
  const link = `${location.origin}/terminy/${game._id}`;

  // komplet = kolejne zapisy „gram” trafiają na listę rezerwową
  const full = limit > 0 && G.in.length >= limit;
  const doSignup = async (status: Status, who: { playerId?: string; newName?: string } = { playerId: me ?? undefined }) => {
    const toastFor = (wasIn: boolean) => toast(status === 'in'
      ? (full && !wasIn ? '⏳ Jesteś na liście rezerwowej – wskoczysz, gdy ktoś zrezygnuje' : '✅ Zapisano – do zobaczenia na boisku!')
      : status === 'maybe' ? '🤔 Zapisano jako „może”' : '❌ Zapisano – nie grasz');
    // nazwa z filtra (np. „Adolf H.”) albo osoba już tak zapisana → zapis tylko w localStorage
    const [f = '', ...rest] = (who.newName ?? '').split(' ');
    const localName = who.newName ? (isBlockedName(f, rest.join('')) ? who.newName : null) : who.playerId === LOCAL_ID ? shadow?.name : null;
    if (localName) {
      const wasIn = local ? local.status === 'in' : false;
      setShadowState(shadowSignup(localName, game._id, status)); buzz();
      toastFor(wasIn);
      return;
    }
    try {
      const pid = await signup({
        gameId: game._id, status,
        ...(who.newName ? { name: who.newName, newPlayer: true } : { playerId: who.playerId as Id<'players'> }),
      });
      setMe(pid); setMeId(pid); buzz();
      if (shadow) { setShadow(null); setShadowState(null); }
      toastFor(game.signups.some((s) => s.playerId === pid && s.status === 'in'));
    } catch (e) { toast('⚠️ ' + errorText(e)); }
  };

  const row = (s: Doc<'signups'>, i?: number) => <li key={s._id} className="srow">
    {i !== undefined && <span className="srow-n">{i + 1}.</span>}
    <span className="srow-name">{nameOf(s.playerId)}{s.playerId === me && <span className="you">Ty</span>}</span>
    {s.by === 'admin' && <span className="srow-by" title="Dodany przez organizatora">✍</span>}
    {isAdmin && s.playerId !== LOCAL_ID && <button type="button" className="pmore" aria-label="Opcje" onClick={async () => {
      const a = await choose(nameOf(s.playerId), 'Zmień zgłoszenie', [
        { label: '✅ Gra', value: 'in' as const }, { label: '🤔 Może', value: 'maybe' as const }, { label: '❌ Nie gra', value: 'out' as const },
        { label: 'Usuń z listy', value: 'remove' as const, cls: 'ghost danger-text' },
      ]);
      if (!a) return;
      try { await adminSignup({ token: token!, gameId: game._id, playerId: s.playerId, status: a === 'remove' ? null : a }); }
      catch (e) { toast('⚠️ ' + errorText(e)); }
    }}>⋯</button>}
  </li>;
  const section = (title: string, list: Doc<'signups'>[], numbered = false) => list.length > 0 &&
    <section className="card"><h2 className="card-title">{title} <span className="muted">({list.length})</span></h2>
      <ul className="slist">{list.map((s, i) => row(s, numbered ? i : undefined))}</ul></section>;

  const lineup = game.teams?.lineup ?? {};
  const teamList = (t: 'A' | 'B') => Object.keys(lineup).filter((p) => lineup[p] === t).map(nameOf).sort((a, b) => a.localeCompare(b, 'pl'));
  const shareList = () => {
    const names = (l: Doc<'signups'>[]) => l.map((s, i) => `${i + 1}. ${nameOf(s.playerId)}`).join('\n');
    const lines = [`📅 ${game.place ? game.place + ' – ' : ''}${gameWhen(game)}`, '', `✅ Grają (${G.in.length}${limit ? '/' + limit : ''}):`, names(G.in) || '—'];
    if (G.reserve.length) lines.push('', '⏳ Rezerwa:', names(G.reserve));
    if (G.maybe.length) lines.push('', `🤔 Może: ${G.maybe.map((s) => nameOf(s.playerId)).join(', ')}`);
    lines.push('', `Zapisy 👉 ${link}`);
    shareOrCopy(lines.join('\n'), toast);
  };

  return <>
    <section className="game-hero">
      <div className="game-place">{game.place || 'Mecz'}</div>
      <div className="game-when">{gameWhen(game)}</div>
      <div className="game-count"><b>{G.in.length}</b>{limit ? ` / ${limit}` : ''} <span>{limit ? 'zajętych miejsc' : plural(G.in.length, 'osoba gra', 'osoby grają', 'osób gra')}</span></div>
      {limit > 0 && <div className="meter"><span style={{ width: `${Math.min(100, (G.in.length / limit) * 100)}%` }} /></div>}
      {full && open && <p className="game-full">Komplet{G.reserve.length ? ` · ${G.reserve.length} na rezerwie` : ''} – nadal możesz się zapisać na rezerwę.</p>}
      {game.note && <p className="game-note">{game.note}</p>}
      {!open && <p className="game-note">Ten mecz już się odbył – zapisy są zamknięte.{game.matchId && <> <Link to={`/historia/${game.matchId}`}>Zobacz wynik ›</Link></>}</p>}
    </section>

    {open && (me ? <section className="card me-card">
      <div className="card-head"><h2 className="card-title">Cześć, {nameOf(me)}!</h2>
        <button type="button" className="link" onClick={() => { setMe(null); setMeId(null); setShadow(null); setShadowState(null); }}>To nie ja</button></div>
      <p className="muted small">{mine?.status === 'in'
        ? (G.reserve.some((s) => s.playerId === me)
          ? `⏳ Jesteś na liście rezerwowej (${G.reserve.findIndex((s) => s.playerId === me) + 1}. w kolejce). Gdy ktoś zrezygnuje, wskoczysz automatycznie.`
          : '✅ Grasz! Możesz zmienić swoją odpowiedź.')
        : mine ? 'Możesz zmienić swoją odpowiedź.'
        : full ? 'Komplet – jeśli klikniesz „Gram”, trafisz na listę rezerwową.' : 'Zagrasz w tym meczu?'}</p>
      <div className="st-btns">
        {(['in', 'maybe', 'out'] as Status[]).map((st) => <button key={st} type="button" className={`btn st-${st} ${mine?.status === st ? 'on' : ''}`} onClick={() => doSignup(st)}>
          {st === 'in' && full && mine?.status !== 'in' ? '⏳ Rezerwa' : LABEL[st]}</button>)}
      </div>
    </section> : <SignupPicker players={players} full={full}
      onPick={(id) => doSignup('in', { playerId: id })}
      onNew={(n) => doSignup('in', { newName: n })} />)}

    {game.teams?.published && Object.keys(lineup).length > 0 && <section className="card">
      <h2 className="card-title">Składy</h2>
      <div className="teams-preview">
        {(['A', 'B'] as const).map((t) => <div key={t} className={`t-${t}`}>
          <div className="group-label"><span className="dot" />{game.teams![t]}</div>
          {teamList(t).map((n) => <div key={n}>{n}</div>)}
        </div>)}
      </div>
    </section>}

    {section(`✅ Grają${limit ? ` (limit ${limit})` : ''}`, G.in, true)}
    {section('⏳ Rezerwa', G.reserve, true)}
    {section('🤔 Może', G.maybe)}
    {section('❌ Nie grają', G.out)}

    {isAdmin && open && <section className="card org-card">
      <h2 className="card-title">Organizator</h2>
      <button type="button" className="btn primary block org-link" onClick={() =>
        shareOrCopy(`⚽ Zapisy na mecz: ${gameWhen(game)}${game.place ? ` – ${game.place}` : ''}\nZapisz się tutaj 👉 ${link}`, toast)}>🔗 Wyślij link do zapisów</button>
      <div className="org-actions">
        <button type="button" className="btn" onClick={() => setAdding(true)}>✍ Dodaj ręcznie</button>
        <Link className="btn" to={`/terminy/${game._id}/sklady`}>⚖️ Ułóż składy</Link>
        <button type="button" className="btn" onClick={() => setEditing(true)}>✎ Edytuj</button>
        <button type="button" className="btn ghost danger-text" onClick={async () => {
          if (!(await confirm('Odwołać mecz?', 'Mecz i wszystkie zgłoszenia zostaną usunięte.', 'Odwołaj mecz'))) return;
          try { await cancel({ token: token!, id: game._id }); nav('/terminy'); toast('Mecz odwołany'); } catch (e) { toast('⚠️ ' + errorText(e)); }
        }}>Odwołaj</button>
      </div>
    </section>}

    <button type="button" className="btn block" onClick={shareList}>📤 Udostępnij listę</button>

    {isAdmin && <>
      <GameForm open={editing} onClose={() => setEditing(false)} game={game} />
      <AddPlayersSheet open={adding} onClose={() => setAdding(false)} gameId={game._id} signedIds={new Set(ins.map((s) => s.playerId as string))} />
    </>}
  </>;
}

/* Ręczne dopisanie zawodników przez organizatora */
export function AddPlayersSheet({ open, onClose, gameId, signedIds }: { open: boolean; onClose: () => void; gameId: Id<'games'>; signedIds: Set<string> }) {
  const { players } = usePlayers();
  const { token } = useAdmin();
  const { toast } = useUI();
  const adminSignup = useMutation(api.games.adminSignup);
  const [name, setName] = useState('');
  const add = async (args: { playerId?: Id<'players'>; name?: string }) => {
    try { await adminSignup({ token: token!, gameId, status: 'in', ...args }); }
    catch (e) { toast('⚠️ ' + errorText(e)); }
  };
  const avail = players.filter((p) => !signedIds.has(p._id));
  return <Sheet open={open} onClose={onClose}>
    <h3>Dodaj ręcznie</h3>
    <p className="muted small">Dla osób, które nie zapisały się same, a wiadomo, że zagrają.</p>
    <form className="inline-form" onSubmit={async (e) => {
      e.preventDefault();
      if (!name.trim()) return;
      await add({ name }); toast(`✍ ${name.trim()} dopisany`); setName(''); onClose();
    }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Imię zawodnika" maxLength={40} autoComplete="off" />
      <button className="btn primary">Dodaj</button>
    </form>
    {avail.length > 0 && <>
      <p className="muted small">Albo wybierz (możesz kilku):</p>
      <div className="chips">{avail.map((p) => <button key={p._id} type="button" className="chip" onClick={() => add({ playerId: p._id })}>{p.name}</button>)}</div>
    </>}
  </Sheet>;
}
