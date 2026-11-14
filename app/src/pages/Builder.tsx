import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { api } from '../../convex/_generated/api';
import { useAdmin } from '../lib/admin';
import { useMatches, usePlayers, useSettings } from '../lib/data';
import { useLive } from '../lib/live';
import { balanceTeams, ratingFn, type Team } from '../lib/stats';
import { Empty, Loading, errorText, useUI } from '../lib/ui';
import { gameWhen, shareOrCopy, uid } from '../lib/format';
import { AddPlayersSheet } from './Game';

type Teams = { A: string; B: string; lineup: Record<string, Team>; published: boolean };
type Zone = Team | 'bench';

export default function Builder() {
  const { id = '' } = useParams();
  const game = useQuery(api.games.get, { id });
  const matches = useMatches();
  const settings = useSettings();
  const { nameOf } = usePlayers();
  const { isAdmin, token } = useAdmin();
  const { toast, confirm } = useUI();
  const saveTeams = useMutation(api.games.saveTeams);
  const { live, start } = useLive();
  const nav = useNavigate();
  const [teams, setTeams] = useState<Teams | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const saveTimer = useRef(0);

  // przeciąganie: myszką od razu, palcem po krótkim przytrzymaniu (żeby dało się przewijać)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }),
  );

  useEffect(() => {
    if (game && !teams) setTeams(game.teams ?? { A: 'Biali', B: 'Czarni', lineup: {}, published: false });
  }, [game, teams]);

  const rate = useMemo(() => ratingFn(matches ?? []), [matches]);

  if (!isAdmin) return <Empty action={<Link className="btn primary" to="/admin">Zaloguj się</Link>}>Składy układa administrator.</Empty>;
  if (game === undefined || !teams || !matches) return <Loading />;
  if (game === null) return <Empty>Nie znaleziono meczu.</Empty>;

  const signed = game.signups.filter((s) => s.status === 'in');
  const limit = game.limit || 0;
  const reserve = new Set(limit ? signed.slice(limit).map((s) => s.playerId as string) : []);
  const pool = [...new Set([...signed.map((s) => s.playerId as string), ...Object.keys(teams.lineup)])];
  const inTeam = (t: Team) => pool.filter((p) => teams.lineup[p] === t).sort((a, b) => rate(b) - rate(a));
  const bench = pool.filter((p) => !teams.lineup[p]);
  const sum = (t: Team) => inTeam(t).reduce((a, p) => a + rate(p), 0);
  const sA = sum('A'), sB = sum('B');
  const share = sA + sB ? Math.round((sA / (sA + sB)) * 100) : 50;

  const change = (next: Teams) => {
    setTeams(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTeams({ token: token!, id: game._id, teams: next }).catch((e) => toast('⚠️ ' + errorText(e)));
    }, 300);
  };
  const move = (pid: string, to: Zone) => {
    const lineup = { ...teams.lineup };
    if (to === 'bench') delete lineup[pid]; else lineup[pid] = to;
    change({ ...teams, lineup });
  };
  const cycle = (pid: string) => move(pid, !teams.lineup[pid] ? 'A' : teams.lineup[pid] === 'A' ? 'B' : 'bench');

  const onDragStart = (e: DragStartEvent) => setDragging(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    if (e.over) move(String(e.active.id), e.over.id as Zone);
  };

  const chip = (pid: string) => <DraggableChip key={pid} pid={pid} team={teams.lineup[pid]} label={nameOf(pid)}
    rating={rate(pid)} reserve={reserve.has(pid)} onTap={() => cycle(pid)} />;

  return <>
    <Link className="back" to={`/terminy/${game._id}`}>‹ {gameWhen(game, false)}</Link>
    <section className="card">
      <h2 className="card-title">Układanie składów</h2>
      <div className="vs-inputs">
        <input className="team-input t-A" value={teams.A} maxLength={20} onChange={(e) => change({ ...teams, A: e.target.value })} aria-label="Nazwa drużyny 1" />
        <span className="vs">vs</span>
        <input className="team-input t-B" value={teams.B} maxLength={20} onChange={(e) => change({ ...teams, B: e.target.value })} aria-label="Nazwa drużyny 2" />
      </div>
      <div className="balance"><span className="bal-a" style={{ width: `${share}%` }} /><span className="bal-b" style={{ width: `${100 - share}%` }} /></div>
      <div className="balance-legend small">
        <span className="t-A">{sA.toFixed(1)}</span>
        <span className="muted">{Math.abs(sA - sB) < 0.3 ? 'wyrównane 👌' : `różnica ${Math.abs(sA - sB).toFixed(1)}`}</span>
        <span className="t-B">{sB.toFixed(1)}</span>
      </div>
    </section>

    <div className="builder-actions">
      <button type="button" className="btn" onClick={() => {
        // wszyscy grający (bez rezerwy) + dopisani ręcznie do drużyn
        const pids = [...new Set([...signed.slice(0, limit || undefined).map((s) => s.playerId as string), ...Object.keys(teams.lineup)])];
        if (pids.length < 2) return toast('Za mało zawodników');
        change({ ...teams, lineup: balanceTeams(pids, rate) });
        toast('⚖️ Wyrównane – kliknij ponownie, żeby dostać inny wariant');
      }}>⚖️ Wyrównaj</button>
      <button type="button" className="btn ghost" onClick={() => change({ ...teams, lineup: {} })}>Wyczyść</button>
    </div>
    <p className="muted small center">Przeciągnij zawodnika do drużyny (na telefonie przytrzymaj chwilę) albo dotknij, żeby przełączyć. Liczba to siła z wyników.</p>

    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="dnd-cols">
        <DropZone id="A" title={teams.A} count={inTeam('A').length} power={sA}>{inTeam('A').map(chip)}</DropZone>
        <DropZone id="B" title={teams.B} count={inTeam('B').length} power={sB}>{inTeam('B').map(chip)}</DropZone>
      </div>
      <DropZone id="bench" title="Ławka – bez drużyny" count={bench.length}>
        {bench.map(chip)}
        {!pool.length && <span className="muted small">Nikt się jeszcze nie zapisał.</span>}
      </DropZone>
      <DragOverlay dropAnimation={null}>
        {dragging && <div className={`chip dragging ${teams.lineup[dragging] ? 'on-' + teams.lineup[dragging] : ''}`}>{nameOf(dragging)}</div>}
      </DragOverlay>
    </DndContext>

    <button type="button" className="btn ghost block" onClick={() => setAdding(true)}>✍ Dodaj zawodnika spoza zapisów</button>
    <div className="btn-row">
      <button type="button" className="btn" onClick={() => { change({ ...teams, published: !teams.published }); toast(teams.published ? 'Składy ukryte' : '👁 Składy widoczne na stronie zapisów'); }}>
        {teams.published ? '✓ Składy widoczne' : '👁 Pokaż wszystkim'}</button>
      <button type="button" className="btn" onClick={() => {
        const list = (t: Team) => inTeam(t).map(nameOf).sort((a, b) => a.localeCompare(b, 'pl')).join(', ') || '—';
        shareOrCopy(`⚽ Składy – ${gameWhen(game)}\n\n${teams.A}: ${list('A')}\n${teams.B}: ${list('B')}`, toast);
      }}>📤 Udostępnij</button>
    </div>
    <button type="button" className="btn primary big block" onClick={async () => {
      if (live) return toast('Najpierw zakończ trwający mecz');
      if (!Object.keys(teams.lineup).length && !(await confirm('Brak składów', 'Zacząć mecz bez przypisanych zawodników?', 'Zacznij', 'primary'))) return;
      const now = Date.now();
      start({
        clientId: uid(), gameId: game._id, season: settings?.season ?? String(new Date().getFullYear()), status: 'live',
        startedAt: now, pausedMs: 0, teams: { A: teams.A || 'Drużyna A', B: teams.B || 'Drużyna B' },
        lineup: { ...teams.lineup }, events: [], rev: 1, syncedRev: 0,
      });
      nav('/mecz');
    }}>▶ Rozpocznij mecz z tymi składami</button>

    <AddPlayersSheet open={adding} onClose={() => setAdding(false)} gameId={game._id} signedIds={new Set(signed.map((s) => s.playerId as string))} />
  </>;
}

function DropZone({ id, title, count, power, children }: { id: Zone; title: string; count: number; power?: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <section ref={setNodeRef} className={`dropzone ${id !== 'bench' ? 't-' + id : ''} ${isOver ? 'over' : ''}`}>
    <div className="group-label"><span className="dot" />{title} <span className="muted">({count}){power !== undefined ? ` · ${power.toFixed(1)}` : ''}</span></div>
    <div className="chips">{children}</div>
  </section>;
}

function DraggableChip({ pid, team, label, rating, reserve, onTap }: {
  pid: string; team?: Team; label: string; rating: number; reserve: boolean; onTap: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: pid });
  return <button ref={setNodeRef} type="button" {...listeners} {...attributes} onClick={onTap}
    className={`chip drag ${team ? 'on-' + team : ''} ${isDragging ? 'ghosted' : ''}`}>
    {label} <small>{rating.toFixed(1)}</small>{reserve && <small> rez.</small>}
  </button>;
}
