import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { MatchLike } from './stats';

/* Trwający mecz administratora. Trzymany na telefonie (działa bez zasięgu na boisku)
   i wysyłany do bazy po każdej zmianie – inni widzą wynik na żywo.
   Zawodnicy dopisani bez zasięgu mają tymczasowe id "new:Imię". */
export type LiveMatch = MatchLike & {
  clientId: string;
  gameId?: string;
  rev: number;        // numer zmiany
  syncedRev: number;  // ostatnia zmiana zapisana na serwerze
  serverId?: string;
};

const KEY = 'hala.live';
const read = (): LiveMatch | null => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };

let current: LiveMatch | null = read();
const subs = new Set<(m: LiveMatch | null) => void>();
function write(m: LiveMatch | null) {
  current = m;
  if (m) localStorage.setItem(KEY, JSON.stringify(m)); else localStorage.removeItem(KEY);
  subs.forEach((f) => f(m));
}

export function useLive() {
  const [m, setM] = useState(current);
  useEffect(() => { subs.add(setM); return () => { subs.delete(setM); }; }, []);
  /* Zmiana meczu (zwiększa numer zmiany → zapis na serwer) */
  const update = useCallback((fn: (m: LiveMatch) => LiveMatch) => {
    if (!current) return;
    write({ ...fn(current), rev: current.rev + 1 });
  }, []);
  const start = useCallback((m: LiveMatch) => write(m), []);
  const clear = useCallback(() => write(null), []);
  return { live: m, update, start, clear };
}

/* Zamiana tymczasowych id zawodników na prawdziwe po zapisie */
function applyMap(m: LiveMatch, map: Record<string, string>): LiveMatch {
  if (!Object.keys(map).length) return m;
  const lineup: LiveMatch['lineup'] = {};
  for (const [k, t] of Object.entries(m.lineup)) lineup[map[k] ?? k] = t;
  return { ...m, lineup, events: m.events.map((e) => (map[e.pid] ? { ...e, pid: map[e.pid] } : e)) };
}

export const toServer = (m: LiveMatch) => ({
  clientId: m.clientId,
  season: m.season,
  gameId: m.gameId as Id<'games'> | undefined,
  status: m.status,
  startedAt: m.startedAt,
  endedAt: m.endedAt,
  pausedAt: m.pausedAt,
  pausedMs: m.pausedMs,
  teams: m.teams,
  lineup: m.lineup,
  events: m.events.map((e) => ({
    id: e.id, type: e.type, pid: e.pid, t: e.t,
    ...(e.type === 'goal' ? { team: e.team, own: !!e.own } : { from: e.from, to: e.to }),
  })),
});

/* Wysyła zmiany trwającego meczu na serwer (bez zasięgu – czeka i ponawia) */
export function useLiveSync(token: string | null) {
  const save = useMutation(api.matches.save);
  const { live } = useLive();
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const retry = useRef(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!live || !token || live.syncedRev >= live.rev || busy.current) return;
    const rev = live.rev;
    const t = setTimeout(async () => {
      busy.current = true;
      try {
        const res = await save({ token, match: toServer(live) });
        setError(null);
        if (current && current.clientId === live.clientId) {
          write({ ...applyMap(current, res.map), syncedRev: Math.max(current.syncedRev, rev), serverId: res.id });
        }
      } catch (e) {
        setError((e as Error).message);
        retry.current = window.setTimeout(() => setTick((x) => x + 1), 8000);
      } finally {
        busy.current = false;
      }
    }, 350);
    return () => clearTimeout(t);
  }, [live, token, save, tick]);

  useEffect(() => () => clearTimeout(retry.current), []);
  return { pending: !!live && live.syncedRev < live.rev, error };
}
