import { useEffect } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAdmin } from './lib/admin';
import { useLive } from './lib/live';
import { useSettings } from './lib/data';
import Home from './pages/Home';
import Games from './pages/Games';
import Game from './pages/Game';
import Builder from './pages/Builder';
import History from './pages/History';
import MatchView from './pages/MatchView';
import Stats from './pages/Stats';
import Live from './pages/Live';
import Admin from './pages/Admin';
import { Empty } from './lib/ui';
import { shortSeason } from './lib/format';

const Icon = {
  home: <svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>,
  games: <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4" /><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 4 1.5M16 17l2 2 4-4" /></svg>,
  ball: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7l4 3-1.5 4.5h-5L8 10z" /><path d="M12 3v4M16 10l4.5-1.5M14.5 14.5l2.5 4M9.5 14.5l-2.5 4M8 10L3.5 8.5" /></svg>,
  history: <svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="17" rx="2" /><path d="M8 2v4M16 2v4M4 10h16M8 14h3M8 17h6" /></svg>,
  stats: <svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
};

export default function App() {
  const { isAdmin } = useAdmin();
  const { live } = useLive();
  const settings = useSettings();
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return <>
    <header className="topbar">
      <Link className="brand" to="/"><img src="/icon.svg" alt="" width={26} height={26} /> Hala DT</Link>
      <div className="top-right">
        {settings && <span className="season-pill" title={`Sezon ${settings.season}`}>Sezon {shortSeason(settings.season)}</span>}
        <Link to="/admin" className={`admin-pill ${isAdmin ? 'on' : ''}`} aria-label="Administrator">{isAdmin ? '🔑 Admin' : '🔒'}</Link>
      </div>
    </header>

    <main className="app">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/terminy" element={<Games />} />
        <Route path="/terminy/:id" element={<Game />} />
        <Route path="/terminy/:id/sklady" element={<Builder />} />
        <Route path="/historia" element={<History />} />
        <Route path="/historia/:id" element={<MatchView />} />
        <Route path="/statystyki" element={<Stats />} />
        <Route path="/mecz" element={<Live />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Empty action={<Link className="btn primary" to="/">Strona główna</Link>}>Nie ma takiej strony.</Empty>} />
      </Routes>
    </main>

    <nav className={`tabbar ${isAdmin ? 'five' : ''}`}>
      <NavLink to="/" end>{Icon.home}<span>Start</span></NavLink>
      <NavLink to="/terminy">{Icon.games}<span>Terminy</span></NavLink>
      {isAdmin && <NavLink to="/mecz" className={({ isActive }) => `${isActive ? 'active' : ''} ${live ? 'live' : ''}`}>{Icon.ball}<span>Mecz</span></NavLink>}
      <NavLink to="/historia">{Icon.history}<span>Historia</span></NavLink>
      <NavLink to="/statystyki">{Icon.stats}<span>Statystyki</span></NavLink>
    </nav>
    <div id="confetti" aria-hidden="true" />
  </>;
}
