import { Link } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useMatches, usePlayers, useSettings } from '../lib/data';
import { useAdmin } from '../lib/admin';
import { seasonStats } from '../lib/stats';
import { gameWhen, goalsWord, plural } from '../lib/format';
import { MatchCard } from '../components';
import { Loading } from '../lib/ui';

export default function Home() {
  const games = useQuery(api.games.list);
  const matches = useMatches();
  const settings = useSettings();
  const { nameOf } = usePlayers();
  const { isAdmin } = useAdmin();
  if (!games || !matches || !settings) return <Loading />;

  const next = [...games].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];
  const live = matches.filter((m) => m.status === 'live' && Date.now() - m.startedAt < 6 * 3600e3);
  const recent = matches.filter((m) => m.status === 'done').slice(0, 3);
  const st = seasonStats(matches, settings.season);
  const top = [...st.list].sort((a, b) => b.goals - a.goals || b.avg - a.avg).filter((r) => r.goals).slice(0, 3);

  return <>
    {live.map((m) => <MatchCard key={m._id} m={m} nameOf={nameOf} />)}

    {next ? <Link to={`/terminy/${next._id}`} className="game-hero next-game">
      <div className="game-place">Najbliższy mecz{next.place ? ` · ${next.place}` : ''}</div>
      <div className="game-when">{gameWhen(next)}</div>
      <div className="game-count"><b>{next.counts.in}</b>{next.limit ? ` / ${next.limit}` : ''} <span>{next.limit ? 'zajętych miejsc' : plural(next.counts.in, 'osoba gra', 'osoby grają', 'osób gra')}</span></div>
      {next.limit > 0 && <div className="meter"><span style={{ width: `${Math.min(100, (next.counts.in / next.limit) * 100)}%` }} /></div>}
      <span className="btn primary block cta">✅ Zapisz się</span>
    </Link> : <section className="card center">
      <p className="muted">Nie ma jeszcze zaplanowanego meczu.</p>
      {isAdmin && <Link to="/terminy" className="btn primary">📅 Zaplanuj mecz</Link>}
    </section>}

    {isAdmin && <div className="btn-row">
      <Link to="/mecz" className="btn">⚽ Mecz na żywo</Link>
      <Link to="/terminy" className="btn">📅 Terminy</Link>
    </div>}

    {top.length > 0 && <section className="card">
      <div className="card-head"><h2 className="card-title">Strzelcy sezonu {settings.season}</h2><Link className="link" to="/statystyki">Wszystko ›</Link></div>
      <ol className="podium">
        {top.map((r, i) => <li key={r.pid}><span className="podium-n">{['🥇', '🥈', '🥉'][i]}</span><span className="podium-name">{nameOf(r.pid)}</span><b>{goalsWord(r.goals)}</b></li>)}
      </ol>
    </section>}

    {recent.length > 0 && <>
      <div className="card-head section-head"><h2 className="section-title">Ostatnie wyniki</h2><Link className="link" to="/historia">Historia ›</Link></div>
      {recent.map((m) => <MatchCard key={m._id} m={m} nameOf={nameOf} />)}
    </>}
  </>;
}
