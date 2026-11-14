import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMatches, usePlayers, useSettings } from '../lib/data';
import { seasonStats, summarize, type StatRow } from '../lib/stats';
import { fmtDate, goalsWord, plural } from '../lib/format';
import { Empty, Loading, Sheet } from '../lib/ui';
import { SeasonPicker, allSeasons, type MatchDoc } from '../components';

type SortKey = 'pts' | 'goals' | 'avg' | 'played' | 'w' | 'd' | 'l';
const sorters: Record<SortKey, (a: StatRow, b: StatRow) => number> = {
  pts: (a, b) => b.pts - a.pts || b.goals - a.goals,
  goals: (a, b) => b.goals - a.goals || b.avg - a.avg,
  avg: (a, b) => b.avg - a.avg || b.goals - a.goals,
  played: (a, b) => b.played - a.played || b.pts - a.pts,
  w: (a, b) => b.w - a.w || b.pct - a.pct,
  d: (a, b) => b.d - a.d,
  l: (a, b) => b.l - a.l,
};

export default function Stats() {
  const matches = useMatches();
  const settings = useSettings();
  const { nameOf } = usePlayers();
  const [season, setSeason] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('pts');
  const [player, setPlayer] = useState<string | null>(null);
  if (!matches || !settings) return <Loading />;
  const s = season ?? settings.season;
  const st = seasonStats(matches, s);
  const picker = <SeasonPicker seasons={allSeasons(settings, matches)} value={s} onChange={setSeason} />;
  if (!st.ms.length) return <>{picker}<Empty>Brak meczów do policzenia statystyk.</Empty></>;

  const list = [...st.list].sort((a, b) => sorters[sort](a, b) || nameOf(a.pid).localeCompare(nameOf(b.pid), 'pl'));
  const best = (fn: (a: StatRow, b: StatRow) => number) => [...st.list].sort(fn)[0];
  const topScorer = best(sorters.goals);
  const topWins = best(sorters.w);
  const minGames = Math.max(1, Math.ceil(st.ms.length / 3));
  const eff = st.list.filter((r) => r.played >= minGames && r.goals).sort(sorters.avg)[0];
  const leaders: [string, string, string, string][] = [];
  if (topScorer?.goals) leaders.push(['👑', 'Król strzelców', nameOf(topScorer.pid), goalsWord(topScorer.goals)]);
  if (topWins?.w) leaders.push(['🏆', 'Najwięcej zwycięstw', nameOf(topWins.pid), `${topWins.w} z ${topWins.played}`]);
  if (eff) leaders.push(['🎯', 'Najskuteczniejszy', nameOf(eff.pid), `${eff.avg.toFixed(2)} gola/mecz`]);
  const mlink = (m: MatchDoc) => { const S = summarize(m); return <Link to={`/historia/${m._id}`}>{m.teams.A} {S.s.A}:{S.s.B} {m.teams.B}</Link>; };
  const th = (key: SortKey, label: string) => <th className={sort === key ? 'sorted' : ''} onClick={() => setSort(key)}>{label}</th>;

  return <>
    {picker}
    <section className="tiles">
      <div className="tile"><b>{st.ms.length}</b><span>{plural(st.ms.length, 'mecz', 'mecze', 'meczów')}</span></div>
      <div className="tile"><b>{st.goals}</b><span>{plural(st.goals, 'gol', 'gole', 'goli')}</span></div>
      <div className="tile"><b>{(st.goals / st.ms.length).toFixed(1)}</b><span>goli / mecz</span></div>
    </section>

    {leaders.length > 0 && <section className="leaders">
      {leaders.map(([i, l, n, v]) => <button type="button" key={l} className="leader" onClick={() => {
        const r = st.list.find((x) => nameOf(x.pid) === n); if (r) setPlayer(r.pid);
      }}><div className="leader-icon">{i}</div><div className="leader-label">{l}</div><div className="leader-name">{n}</div><div className="leader-val">{v}</div></button>)}
    </section>}

    <section className="card">
      <h2 className="card-title">Tabela</h2>
      <div className="table-wrap">
        <table className="table stats">
          <thead><tr><th>#</th><th className="l">Zawodnik</th>{th('played', 'M')}{th('w', 'W')}{th('d', 'R')}{th('l', 'P')}{th('goals', '⚽')}{th('avg', 'Śr')}{th('pts', 'Pkt')}</tr></thead>
          <tbody>{list.map((r, i) => <tr key={r.pid} onClick={() => setPlayer(r.pid)}>
            <td className="muted">{i + 1}</td>
            <td className="l"><div className="pcell">{nameOf(r.pid)}</div><div className="form">{r.form.slice(-5).map((f, j) => <i key={j} className={`res res-${f === 'd' ? 'r' : f}`} />)}</div></td>
            <td>{r.played}</td><td>{r.w}</td><td>{r.d}</td><td>{r.l}</td>
            <td><b>{r.goals}</b></td><td>{r.avg.toFixed(1)}</td><td><b>{r.pts}</b></td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="muted small">M – mecze, W/R/P – wygrane/remisy/porażki, Śr – gole na mecz, Pkt – 3 za wygraną, 1 za remis. Wynik liczy się dla drużyny, w której zawodnik kończył mecz. Dotknij nagłówka, żeby sortować, a zawodnika – żeby zobaczyć jego mecze.</p>
    </section>

    <section className="card">
      <h2 className="card-title">Rekordy</h2>
      <dl className="records">
        {st.rec.win && <div><dt>Najwyższe zwycięstwo</dt><dd>{mlink(st.rec.win.m)}</dd></div>}
        {st.rec.goals && <div><dt>Najwięcej goli w meczu</dt><dd>{st.rec.goals.v} – {mlink(st.rec.goals.m)}</dd></div>}
        {st.rec.player && <div><dt>Rekord zawodnika w meczu</dt><dd>{nameOf(st.rec.player.pid)} – {goalsWord(st.rec.player.v)}</dd></div>}
        {st.hats > 0 && <div><dt>Hat-tricki</dt><dd>{st.hats}</dd></div>}
      </dl>
    </section>

    <PlayerSheet pid={player} onClose={() => setPlayer(null)} matches={st.ms} nameOf={nameOf} season={s} />
  </>;
}

function PlayerSheet({ pid, onClose, matches, nameOf, season }: { pid: string | null; onClose: () => void; matches: MatchDoc[]; nameOf: (id: string) => string; season: string }) {
  if (!pid) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  let g = 0, w = 0, d = 0, l = 0;
  const rows = [...matches].sort((a, b) => b.startedAt - a.startedAt).flatMap((m) => {
    const S = summarize(m);
    const p = S.players.find((x) => x.pid === pid);
    if (!p || !p.team) return [];
    const res = !S.winner ? 'r' : S.winner === p.team ? 'w' : 'l';
    if (res === 'w') w++; else if (res === 'l') l++; else d++;
    g += p.total;
    return [<Link key={m._id} className="drow" to={`/historia/${m._id}`} onClick={onClose}>
      <i className={`res res-${res}`} />
      <span className="drow-date">{fmtDate(m.startedAt, { day: 'numeric', month: 'short' })}</span>
      <span className="drow-score">{m.teams.A} {S.s.A}:{S.s.B} {m.teams.B}</span>
      <span className="drow-g">{p.total ? `⚽${p.total}` : ''}{p.switched ? ' ⇄' : ''}</span>
    </Link>];
  });
  return <Sheet open onClose={onClose}>
    <h3>{nameOf(pid)}</h3>
    <p className="muted">{season === 'all' ? 'Wszystkie sezony' : `Sezon ${season}`}</p>
    <div className="tiles small-tiles">
      <div className="tile"><b>{rows.length}</b><span>mecze</span></div>
      <div className="tile"><b>{g}</b><span>gole</span></div>
      <div className="tile"><b>{w}-{d}-{l}</b><span>W-R-P</span></div>
    </div>
    <div className="drows">{rows.length ? rows : <p className="muted">Brak meczów.</p>}</div>
  </Sheet>;
}
