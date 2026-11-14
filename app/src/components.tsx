import { Link } from 'react-router-dom';
import type { Doc } from '../convex/_generated/dataModel';
import { beneficiary, elapsed, score, summarize, type MatchEvent, type MatchLike, type Team } from './lib/stats';
import { fmtDate, minute } from './lib/format';

export type MatchDoc = Doc<'matches'>;

export function EventRow({ m, e, run, nameOf, onDelete }: {
  m: MatchLike; e: MatchEvent; run?: string; nameOf: (id: string) => string; onDelete?: () => void;
}) {
  const side: Team = e.type === 'goal' ? beneficiary(e) : e.to!;
  return <li className={`ev side-${side}`}>
    <span className="ev-min">{minute(e.t)}</span>
    <span className={`ev-bar t-${side}`} />
    <span className="ev-body">
      {e.type === 'goal'
        ? <>{e.own ? '🙈' : '⚽'} <b>{nameOf(e.pid)}</b>{e.own && <span className="muted"> (samobój)</span>}</>
        : <>⇄ <b>{nameOf(e.pid)}</b> <span className="muted">→ {m.teams[e.to!]}</span></>}
    </span>
    <span className="ev-run">{run ?? ''}</span>
    {onDelete && <button type="button" className="ev-del" onClick={onDelete} aria-label="Usuń">×</button>}
  </li>;
}

export function MatchCard({ m, nameOf, showSeason }: { m: MatchDoc; nameOf: (id: string) => string; showSeason?: boolean }) {
  const S = summarize(m, nameOf);
  const sc = (t: Team) => S.scorers[t].map((x) => `${nameOf(x.pid)}${x.n > 1 ? ` ×${x.n}` : ''}${x.own ? ' (s.)' : ''}`).join(', ');
  const live = m.status === 'live';
  return <Link className={`mcard ${live ? 'live' : ''}`} to={`/historia/${m._id}`}>
    <div className="mcard-date">
      {live ? <><span className="live-dot" /> Na żywo · {minute(elapsed(m))}</> : <>{fmtDate(m.startedAt)}{showSeason ? ` · ${m.season}` : ''}</>}
    </div>
    <div className="mcard-score">
      <span className={`t-A ${S.winner === 'A' && !live ? 'won' : ''}`}>{m.teams.A}</span>
      <b>{S.s.A}:{S.s.B}</b>
      <span className={`t-B ${S.winner === 'B' && !live ? 'won' : ''}`}>{m.teams.B}</span>
    </div>
    {S.total > 0 && <div className="mcard-scorers"><span>{sc('A')}</span><span>{sc('B')}</span></div>}
  </Link>;
}

export function SeasonPicker({ seasons, value, onChange }: { seasons: string[]; value: string; onChange: (s: string) => void }) {
  return <div className="seg">
    {seasons.map((s) => <button key={s} type="button" className={s === value ? 'on' : ''} onClick={() => onChange(s)}>{s}</button>)}
    <button type="button" className={value === 'all' ? 'on' : ''} onClick={() => onChange('all')}>Wszystkie</button>
  </div>;
}

/* Sezony z ustawień + z meczów (najnowsze pierwsze) */
export const allSeasons = (settings: { seasons: string[] } | undefined, matches: MatchLike[] | undefined) =>
  [...new Set([...(settings?.seasons ?? []), ...(matches ?? []).map((m) => m.season)])].filter(Boolean).sort().reverse();

export const liveScore = (m: MatchLike) => { const s = score(m); return `${s.A}:${s.B}`; };
