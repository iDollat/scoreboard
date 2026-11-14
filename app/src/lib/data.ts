import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

/* Wspólne dane z bazy (Convex odświeża je na żywo) */
export function usePlayers() {
  const players = useQuery(api.players.list);
  return useMemo(() => {
    const map = new Map((players ?? []).map((p) => [p._id as string, p.name]));
    const nameOf = (id: string) => (id.startsWith('new:') ? id.slice(4) : map.get(id) ?? '?');
    const sorted = [...(players ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'pl'));
    return { players: sorted, loaded: players !== undefined, nameOf };
  }, [players]);
}
export const useMatches = () => useQuery(api.matches.list);
export const useSettings = () => useQuery(api.settings.get);

/* „Kim jestem” – zapamiętany na tym telefonie zawodnik (do zapisów) */
const ME_KEY = 'hala.me';
export const getMe = (): string | null => localStorage.getItem(ME_KEY);
export const setMe = (id: string | null) => (id ? localStorage.setItem(ME_KEY, id) : localStorage.removeItem(ME_KEY));
