import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAdmin } from '../lib/admin';
import { usePlayers } from '../lib/data';
import { useLive } from '../lib/live';
import { summarize, type MatchLike, type Team } from '../lib/stats';
import { Empty, Loading, confetti, errorText, useUI } from '../lib/ui';
import { fmtDate, goalsWord, minute, shareOrCopy } from '../lib/format';
import { EventRow } from '../components';

export default function MatchView() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const m = useQuery(api.matches.get, { id });
  const { nameOf } = usePlayers();
  const { isAdmin, token } = useAdmin();
  const { live, start } = useLive();
  const { toast, confirm } = useUI();
  const remove = useMutation(api.matches.remove);
  const nav = useNavigate();
  const [, tick] = useState(0);

  useEffect(() => { if (params.get('nowy')) confetti(); }, [params]);
  // zegar meczu na żywo
  useEffect(() => {
    if (m?.status !== 'live') return;
    const t = setInterval(() => tick((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, [m?.status]);

  if (m === undefined) return <Loading />;
  if (m === null) return <Empty action={<Link className="btn primary" to="/historia">Historia</Link>}>Nie znaleziono meczu.</Empty>;

  const S = summarize(m, nameOf);
  const { s, winner } = S;
  const T = m.teams;
  const isLive = m.status === 'live';
  const scorerList = (t: Team) => S.scorers[t].map((x, i) => <span key={i}>{nameOf(x.pid)}{x.n > 1 ? ` ×${x.n}` : ''}{x.own && <i> (sam.)</i>}</span>);

  const hi: [string, string, string][] = [];
  if (S.top.length) hi.push(['👑', 'Król strzelców', `${S.top.map((p) => nameOf(p.pid)).join(', ')} – ${goalsWord(S.top[0].total)}`]);
  for (const p of S.players.filter((x) => x.total >= 3)) hi.push(['🎩', p.total === 3 ? 'Hat-trick' : p.total === 4 ? 'Poker' : `${p.total} goli w meczu!`, nameOf(p.pid)]);
  if (S.comeback && winner) hi.push(['🔥', 'Comeback', `${T[winner]} odrobili stratę ${S.comeback} ${S.comeback === 1 ? 'gola' : 'goli'}`]);
  if (S.decisive && S.total > 1 && !isLive) hi.push(['🎯', 'Gol na wagę zwycięstwa', `${nameOf(S.decisive.pid)}${S.decisive.own ? ' (samobój)' : ''}, ${minute(S.decisive.t)}`]);
  if (S.firstGoal) hi.push(['🥇', 'Pierwszy gol', `${nameOf(S.firstGoal.pid)}${S.firstGoal.own ? ' (samobój)' : ''}, ${minute(S.firstGoal.t)}`]);
  const leadT: Team = S.maxLead.A >= S.maxLead.B ? 'A' : 'B';
  if (S.maxLead[leadT] >= 3) hi.push(['📈', 'Najwyższe prowadzenie', `${T[leadT]} +${S.maxLead[leadT]}`]);
  const switched = S.players.filter((p) => p.switched);
  if (switched.length) hi.push(['⇄', 'Zmiany drużyn', switched.map((p) => nameOf(p.pid)).join(', ')]);
  const owns = S.players.reduce((a, p) => a + p.own, 0);
  if (owns) hi.push(['🙈', 'Samobóje', String(owns)]);
  hi.push(['⏱', 'Czas gry', `${Math.max(1, Math.round(S.duration / 60000))} min · ${goalsWord(S.total)}`]);

  const resultFor = (team: Team | null) => !team ? '' : !winner ? 'r' : team === winner ? 'w' : 'l';
  const share = () => {
    const list = (t: Team) => S.scorers[t].map((x) => `${nameOf(x.pid)}${x.n > 1 ? ` x${x.n}` : ''}${x.own ? ' (sam.)' : ''}`).join(', ');
    const lines = [`⚽ ${T.A} ${s.A} : ${s.B} ${T.B}`, `📅 ${fmtDate(m.startedAt)} · ${Math.max(1, Math.round(S.duration / 60000))} min`, ''];
    if (S.scorers.A.length) lines.push(`${T.A}: ${list('A')}`);
    if (S.scorers.B.length) lines.push(`${T.B}: ${list('B')}`);
    if (S.top.length) lines.push('', `👑 Król strzelców: ${S.top.map((p) => nameOf(p.pid)).join(', ')} (${S.top[0].total})`);
    lines.push(isLive ? '🔴 Mecz trwa' : winner ? `🏆 Wygrywają ${T[winner]}` : '🤝 Remis', '', `${location.origin}/historia/${m._id}`);
    shareOrCopy(lines.join('\n'), toast);
  };

  return <>
    <section className={`hero ${winner ? 'win-' + winner : 'draw'}`}>
      <div className="hero-date">{fmtDate(m.startedAt)} · sezon {m.season}</div>
      <div className="hero-score">
        <div className={`hero-team t-A ${winner === 'A' ? 'won' : ''}`}><span>{T.A}</span><b>{s.A}</b></div>
        <div className="hero-sep">:</div>
        <div className={`hero-team t-B ${winner === 'B' ? 'won' : ''}`}><b>{s.B}</b><span>{T.B}</span></div>
      </div>
      <div className="hero-result">{isLive ? <><span className="live-dot" /> Na żywo · {minute(S.duration)}</> : winner ? `🏆 Wygrywają ${T[winner]}` : '🤝 Remis'}</div>
      <div className="hero-scorers"><div className="t-A">{scorerList('A')}</div><div className="t-B">{scorerList('B')}</div></div>
    </section>

    <section className="highlights">
      {hi.map(([icon, label, val]) => <div key={label + val} className="hl"><div className="hl-icon">{icon}</div><div><div className="hl-label">{label}</div><div className="hl-val">{val}</div></div></div>)}
    </section>

    {S.players.length > 0 && <section className="card">
      <h2 className="card-title">Zawodnicy</h2>
      <table className="table">
        <thead><tr><th className="l">Zawodnik</th><th className="l">Drużyna</th><th>⚽</th></tr></thead>
        <tbody>{S.players.map((p) => <tr key={p.pid}>
          <td className="l"><span className={`res res-${isLive ? '' : resultFor(p.team)}`} />{nameOf(p.pid)}</td>
          <td className="l">{p.switched
            ? <><span className="muted small">⇄ teraz: {p.team ? T[p.team] : '–'}</span> {(['A', 'B'] as Team[]).filter((t) => p.goals[t]).map((t) => <span key={t} className={`tag t-${t}`}>{T[t]} {p.goals[t]}</span>)}</>
            : p.team && <span className={`tag t-${p.team}`}>{T[p.team]}</span>}</td>
          <td><b>{p.total || ''}</b>{p.own > 0 && <span className="muted small"> 🙈{p.own}</span>}</td>
        </tr>)}</tbody>
      </table>
    </section>}

    {S.timeline.length > 0 && <section className="card">
      <h2 className="card-title">Przebieg meczu</h2>
      <ul className="events">{S.timeline.map((e) => <EventRow key={e.id} m={m} e={e} nameOf={nameOf} run={e.type === 'goal' ? `${e.run.A}:${e.run.B}` : ''} />)}</ul>
    </section>}

    <div className="btn-row">
      <button type="button" className="btn primary" onClick={share}>📤 Udostępnij</button>
      <Link className="btn" to="/historia">Historia</Link>
    </div>
    {isLive && <p className="muted small center">Wynik odświeża się sam.</p>}
    {isAdmin && !isLive && <div className="btn-row">
      {!live && <button type="button" className="btn ghost" onClick={async () => {
        if (!(await confirm('Wznowić mecz?', 'Mecz wróci do trybu na żywo – możesz dopisać gole i zakończyć go ponownie.', '↺ Wznów', 'primary'))) return;
        const lm: MatchLike = m;
        start({ ...lm, clientId: m.clientId, gameId: m.gameId, status: 'live', pausedAt: m.endedAt, endedAt: undefined, rev: 1, syncedRev: 0, serverId: m._id });
        nav('/mecz');
      }}>↺ Wznów mecz</button>}
      <button type="button" className="btn ghost danger-text" onClick={async () => {
        if (!(await confirm('Usunąć mecz?', 'Mecz zniknie z historii i statystyk. Tego nie da się cofnąć.', '🗑 Usuń'))) return;
        try { await remove({ token: token!, id: m._id }); nav('/historia'); toast('Mecz usunięty'); } catch (e) { toast('⚠️ ' + errorText(e)); }
      }}>🗑 Usuń</button>
    </div>}
  </>;
}
