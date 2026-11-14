import { useMemo, useState } from 'react';
import { nameKey, norm } from '../lib/format';

type Player = { _id: string; name: string };

/* Zapis osoby, której telefon jeszcze nie zna:
   „Grałem już” – wybór siebie z listy, „Pierwszy raz” – imię (+ litera nazwiska, gdy imię jest zajęte). */
export default function SignupPicker({ players, full, onPick, onNew }: {
  players: Player[];
  full: boolean; // komplet – zapis trafi na rezerwę
  onPick: (id: string) => void;
  onNew: (name: string) => void;
}) {
  const [mode, setMode] = useState<'list' | 'new'>(players.length ? 'list' : 'new');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Player | null>(null);
  const [first, setFirst] = useState('');
  const [initial, setInitial] = useState('');
  const cta = full ? '⏳ Zapisz mnie na rezerwę' : '✅ Gram';

  const filtered = useMemo(() => {
    const k = nameKey(q);
    return players.filter((p) => !k || nameKey(p.name).includes(k));
  }, [players, q]);

  // nowa osoba: „Kamil” albo „Kamil S.”
  const cap = (s: string) => s.charAt(0).toLocaleUpperCase('pl') + s.slice(1);
  const firstClean = cap(norm(first).split(' ')[0] ?? '');
  const letter = initial.trim().charAt(0).toLocaleUpperCase('pl');
  const fullName = firstClean ? (letter ? `${firstClean} ${letter}.` : firstClean) : '';
  const sameFirst = firstClean ? players.filter((p) => nameKey(p.name.split(' ')[0]) === nameKey(firstClean)) : [];
  const taken = fullName && players.some((p) => nameKey(p.name) === nameKey(fullName));

  return <section className="card me-card">
    <h2 className="card-title">Zapisz się</h2>
    {players.length > 0 && <div className="seg seg-full">
      <button type="button" className={mode === 'list' ? 'on' : ''} onClick={() => setMode('list')}>Grałem już</button>
      <button type="button" className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>Pierwszy raz</button>
    </div>}

    {mode === 'list' ? <>
      <input className="picker-search" value={q} onChange={(e) => { setQ(e.target.value); setPicked(null); }} placeholder="🔍 Znajdź swoje imię" autoComplete="off" />
      <div className="chips picker-chips">
        {filtered.map((p) => <button key={p._id} type="button" className={`chip ${picked?._id === p._id ? 'on-A' : ''}`} onClick={() => setPicked(p)}>{p.name}</button>)}
        {!filtered.length && <span className="muted small">Nie ma takiej osoby – wybierz „Pierwszy raz”.</span>}
      </div>
      <button type="button" className="btn primary block big" disabled={!picked} onClick={() => picked && onPick(picked._id)}>
        {picked ? `${cta} – ${picked.name}` : 'Wybierz siebie z listy'}
      </button>
    </> : <form onSubmit={(e) => { e.preventDefault(); if (fullName && !taken) onNew(fullName); }}>
      <div className="new-player">
        <label>Imię<input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="np. Kamil" maxLength={20} autoComplete="given-name" /></label>
        <label>Nazwisko<input value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="1. litera" maxLength={1} autoComplete="off" className="initial" /></label>
      </div>
      {sameFirst.length > 0 && <p className={`small ${taken ? 'error-text' : 'muted'}`}>
        {taken
          ? `„${fullName}” już jest na liście${letter ? '' : ' – dodaj pierwszą literę nazwiska'}. Jeśli to Ty, wybierz siebie w zakładce „Grałem już”.`
          : `Na liście jest już: ${sameFirst.map((p) => p.name).join(', ')}. Zapiszesz się jako „${fullName}”.`}
      </p>}
      <button className="btn primary block big" disabled={!fullName || !!taken}>{fullName && !taken ? `${cta} – ${fullName}` : cta}</button>
    </form>}

    <p className="muted small">Zapamiętamy Cię na tym telefonie – następnym razem wystarczy jedno kliknięcie.</p>
  </section>;
}
