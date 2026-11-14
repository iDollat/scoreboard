'use strict';

/* =========================================================
   Warstwa danych
   ---------------------------------------------------------
   Aplikacja trzyma cały stan w jednym obiekcie `db` i po każdej
   zmianie woła Store.save(db). Store:
     1. zawsze zapisuje kopię w localStorage (działa offline),
     2. jeśli podpięta jest baza – wylicza, które rekordy się
        zmieniły od ostatniej synchronizacji i wysyła tylko je,
     3. co jakiś czas pobiera zmiany od innych i scala je
        z lokalnymi (lokalne, jeszcze niewysłane zmiany wygrywają).

   Kolekcje współdzielone (trafiają do bazy): players, matches,
   games, signups. Reszta (aktywny mecz, ustawienia, „kim jestem”)
   zostaje tylko na urządzeniu.
   ========================================================= */

const STORE_KEY = 'scoreboard.v2';
const SYNC_KEY = 'scoreboard.synced';
const SHARED = ['players', 'matches', 'games', 'signups'];

/* Krótki hash tekstu (FNV-1a) – żeby nie trzymać drugiej kopii danych */
function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
const hashRec = (r) => hashStr(JSON.stringify(r));

/* ---------- Adapter: Supabase (REST, bez dodatkowych bibliotek) ----------
   Każda kolekcja to tabela: id text PK, data jsonb, updated_at.
   Schemat: supabase/schema.sql. NIEPRZETESTOWANY z prawdziwą bazą. */
function SupabaseAdapter({ url, anonKey }) {
  const base = url.replace(/\/$/, '') + '/rest/v1/';
  const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' };
  const check = async (res) => { if (!res.ok) throw new Error(`${res.status} ${await res.text()}`); return res; };
  return {
    name: 'supabase',
    async pullAll() {
      const out = {};
      await Promise.all(SHARED.map(async (c) => {
        const res = await check(await fetch(`${base}${c}?select=data`, { headers }));
        out[c] = (await res.json()).map((row) => row.data);
      }));
      return out;
    },
    async push({ upserts, deletes }) {
      for (const c of SHARED) {
        if (upserts[c].length) {
          const now = new Date().toISOString();
          await check(await fetch(`${base}${c}`, {
            method: 'POST',
            headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify(upserts[c].map((r) => ({ id: r.id, data: r, updated_at: now }))),
          }));
        }
        if (deletes[c].length) {
          const ids = deletes[c].map((id) => `"${String(id).replace(/"/g, '')}"`).join(',');
          await check(await fetch(`${base}${c}?id=in.(${encodeURIComponent(ids)})`, { method: 'DELETE', headers }));
        }
      }
    },
  };
}

const Store = (() => {
  const cfg = Object.assign({ backend: 'local', pollSeconds: 30 }, window.SCOREBOARD_CONFIG || {});
  let adapter = null;
  let current = null;
  let status = 'local';     // local | syncing | ok | offline
  let lastSync = null;
  let pushTimer = null, pushing = false, pushAgain = false;
  const listeners = [];

  const readSync = () => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch (e) { return {}; } };
  const writeSync = (s) => localStorage.setItem(SYNC_KEY, JSON.stringify(s));
  const writeLocal = () => localStorage.setItem(STORE_KEY, JSON.stringify(current));
  const setStatus = (s) => { status = s; listeners.forEach((f) => f({ type: 'status', status })); };

  /* Co się zmieniło lokalnie względem ostatniej synchronizacji */
  function diff(db, synced) {
    const upserts = {}, deletes = {}, hashes = {};
    let empty = true;
    for (const c of SHARED) {
      const prev = synced[c] || {};
      const recs = db[c] || [];
      hashes[c] = {};
      upserts[c] = recs.filter((r) => { const h = hashRec(r); hashes[c][r.id] = h; return prev[r.id] !== h; });
      const ids = new Set(recs.map((r) => r.id));
      deletes[c] = Object.keys(prev).filter((id) => !ids.has(id));
      if (upserts[c].length || deletes[c].length) empty = false;
    }
    return { upserts, deletes, hashes, empty };
  }

  async function push() {
    if (!adapter) return;
    if (pushing) { pushAgain = true; return; }
    const d = diff(current, readSync());
    if (d.empty) return;
    pushing = true;
    setStatus('syncing');
    try {
      await adapter.push(d);
      const s = readSync();
      for (const c of SHARED) {
        s[c] ??= {};
        for (const r of d.upserts[c]) s[c][r.id] = d.hashes[c][r.id];
        for (const id of d.deletes[c]) delete s[c][id];
      }
      writeSync(s);
      lastSync = Date.now();
      setStatus('ok');
    } catch (e) {
      console.warn('Synchronizacja nieudana – spróbuję ponownie', e);
      setStatus('offline');
      clearTimeout(pushTimer);
      pushTimer = setTimeout(push, 15000);
    } finally {
      pushing = false;
      if (pushAgain) { pushAgain = false; push(); }
    }
  }

  async function pull() {
    if (!adapter || document.visibilityState === 'hidden') return;
    try {
      const remote = await adapter.pullAll();
      const pending = diff(current, readSync());
      const merged = { ...current };
      const synced = {};
      let changed = false;
      for (const c of SHARED) {
        synced[c] = {};
        const local = new Map((current[c] || []).map((r) => [r.id, r]));
        const map = new Map();
        for (const r of remote[c] || []) {
          const h = hashRec(r);
          synced[c][r.id] = h;
          const mine = local.get(r.id);
          // zachowujemy lokalny obiekt, jeśli jest identyczny (aplikacja trzyma do niego referencje)
          map.set(r.id, mine && hashRec(mine) === h ? mine : r);
          if (!mine || hashRec(mine) !== h) changed = true;
        }
        for (const r of pending.upserts[c]) map.set(r.id, r);
        for (const id of pending.deletes[c]) map.delete(id);
        for (const id of local.keys()) if (!map.has(id)) changed = true;
        merged[c] = [...map.values()];
      }
      writeSync(synced);
      current = merged;
      writeLocal();
      lastSync = Date.now();
      setStatus('ok');
      if (changed) listeners.forEach((f) => f({ type: 'data', db: merged }));
      if (!pending.empty) push();
    } catch (e) {
      console.warn('Nie udało się pobrać danych z bazy', e);
      setStatus('offline');
    }
  }

  return {
    /* Synchronicznie – żeby pierwszy ekran pokazał się od razu */
    load(fresh) {
      try {
        const d = JSON.parse(localStorage.getItem(STORE_KEY));
        current = d && d.version === 2 ? { ...fresh(), ...d } : fresh();
      } catch (e) { current = fresh(); }
      return current;
    },
    save(db) {
      current = db;
      writeLocal();
      if (adapter) { clearTimeout(pushTimer); pushTimer = setTimeout(push, 600); }
    },
    /* Start synchronizacji (jeśli baza jest skonfigurowana) */
    init() {
      const sb = cfg.supabase || {};
      if (cfg.backend === 'supabase' && sb.url && sb.anonKey) adapter = SupabaseAdapter(sb);
      if (!adapter) return;
      pull();
      setInterval(pull, Math.max(10, cfg.pollSeconds) * 1000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); });
      window.addEventListener('online', () => { push(); pull(); });
    },
    onChange(fn) { listeners.push(fn); },
    get remote() { return !!adapter; },
    get status() { return status; },
    get lastSync() { return lastSync; },
    syncNow() { return adapter ? pull() : Promise.resolve(); },
  };
})();
