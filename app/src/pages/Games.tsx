import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Doc } from '../../convex/_generated/dataModel';
import { useAdmin } from '../lib/admin';
import { Empty, Loading, Sheet, errorText, useUI } from '../lib/ui';
import { gameWhen, nextFridayIso } from '../lib/format';

export default function Games() {
  const games = useQuery(api.games.list);
  const { isAdmin } = useAdmin();
  const [planning, setPlanning] = useState(false);
  const nav = useNavigate();
  if (!games) return <Loading />;
  const list = [...games].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  return <>
    {list.length ? <>
      <h2 className="section-title">Zaplanowane mecze</h2>
      {list.map((g) => <Link key={g._id} className="mcard" to={`/terminy/${g._id}`}>
        <div className="mcard-date">{g.place || 'Mecz'}</div>
        <div className="game-when">{gameWhen(g)}</div>
        <div className="muted small">✅ {g.counts.in}{g.limit ? `/${g.limit}` : ''} zapisanych{g.counts.maybe ? ` · 🤔 ${g.counts.maybe}` : ''}</div>
      </Link>)}
    </> : <Empty>Nie ma zaplanowanych meczów.{!isAdmin && <><br />Organizator doda je tutaj.</>}</Empty>}
    {isAdmin && <button type="button" className="btn primary big block" onClick={() => setPlanning(true)}>📅 Zaplanuj mecz</button>}
    <GameForm open={planning} onClose={() => setPlanning(false)} onSaved={(id) => nav(`/terminy/${id}`)} />
  </>;
}

/* Formularz terminu: nowy albo edycja */
export function GameForm({ open, onClose, game, onSaved }: {
  open: boolean; onClose: () => void; game?: Doc<'games'>; onSaved?: (id: string) => void;
}) {
  const { token } = useAdmin();
  const { toast } = useUI();
  const create = useMutation(api.games.create);
  const update = useMutation(api.games.update);
  const [busy, setBusy] = useState(false);
  return <Sheet open={open} onClose={onClose}>
    {open && <>
      <h3>{game ? 'Edytuj mecz' : 'Zaplanuj mecz'}</h3>
      <form className="stack-form" onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const v = {
          date: String(f.get('date')), time: String(f.get('time') || ''), place: String(f.get('place') || ''),
          limit: parseInt(String(f.get('limit') || '0'), 10) || 0, note: String(f.get('note') || ''),
        };
        setBusy(true);
        try {
          if (game) { await update({ token: token!, id: game._id, ...v }); onClose(); }
          else { const id = await create({ token: token!, ...v }); onClose(); onSaved?.(id); toast('📅 Mecz zaplanowany – wyślij link do zapisów'); }
        } catch (err) { toast('⚠️ ' + errorText(err)); } finally { setBusy(false); }
      }}>
        <div className="two">
          <label>Data<input type="date" name="date" defaultValue={game?.date ?? nextFridayIso()} required /></label>
          <label>Godzina<input type="time" name="time" defaultValue={game?.time ?? '21:00'} /></label>
        </div>
        <label>Miejsce<input name="place" defaultValue={game?.place ?? ''} maxLength={60} placeholder="np. Hala przy szkole" /></label>
        <label>Limit miejsc<input type="number" name="limit" defaultValue={game?.limit || ''} min={0} max={60} inputMode="numeric" placeholder="bez limitu" /></label>
        <label>Notatka<input name="note" defaultValue={game?.note ?? ''} maxLength={160} placeholder="np. zrzutka 10 zł, jasna i ciemna koszulka" /></label>
        <button className="btn primary big" disabled={busy}>{game ? 'Zapisz' : 'Utwórz i otwórz zapisy'}</button>
      </form>
    </>}
  </Sheet>;
}
