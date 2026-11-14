import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMatches, usePlayers, useSettings } from '../lib/data';
import { Empty, Loading } from '../lib/ui';
import { MatchCard, SeasonPicker, allSeasons } from '../components';

export default function History() {
  const matches = useMatches();
  const settings = useSettings();
  const { nameOf } = usePlayers();
  const [season, setSeason] = useState<string | null>(null);
  if (!matches || !settings) return <Loading />;
  const s = season ?? settings.season;
  const live = matches.filter((m) => m.status === 'live' && Date.now() - m.startedAt < 6 * 3600e3);
  const list = matches.filter((m) => m.status === 'done' && (s === 'all' || m.season === s));
  return <>
    <SeasonPicker seasons={allSeasons(settings, matches)} value={s} onChange={setSeason} />
    {live.map((m) => <MatchCard key={m._id} m={m} nameOf={nameOf} />)}
    {list.length ? list.map((m) => <MatchCard key={m._id} m={m} nameOf={nameOf} showSeason={s === 'all'} />)
      : <Empty action={<Link className="btn primary" to="/terminy">Zobacz terminy</Link>}>Brak meczów w tym sezonie.</Empty>}
  </>;
}
