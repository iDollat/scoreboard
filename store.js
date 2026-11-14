'use strict';

/* =========================================================
   Warstwa danych
   ---------------------------------------------------------
   Aplikacja trzyma cały stan w jednym obiekcie `db` i po każdej
   zmianie woła Store.save(db). Store:
     1. zawsze zapisuje kopię w localStorage (działa offline),
     2. jeśli podpięta jest baza – wylicza, które rekordy zmieniły
        się od ostatniej synchronizacji i wysyła tylko je,
     3. co kilkanaście sekund pobiera zmiany od innych (tylko nowości)
        i scala je z lokalnymi – lokalne, jeszcze niewysłane zmiany wygrywają.

   Kolekcje współdzielone (trafiają do bazy): players, matches,
   games, signups. Reszta (aktywny mecz, ustawienia, „kim jestem”)
   zostaje tylko na urządzeniu.
   ========================================================= */

const STORE_KEY = 'scoreboard.v2';
const SYNC_KEY = 'scoreboard.sync';
const SHARED = ['players', 'matches', 'games', 'signups'];

/* Krótki hash tekstu (FNV-1a) – żeby nie trzymać drugiej kopii danych */
function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
const hashRec = (r) => hashStr(JSON.stringify(r));

/* ---------- Adapter: Convex (publiczne HTTP API, bez bibliotek) ----------
   Funkcje serwera: convex/sync.ts (pull, push). */
function ConvexAdapter({ url }) {
  const base = url.replace(/\/$/, '');
  const call = async (kind, path, args) => {
    const res = await fetch(`${base}/api/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, args, format: 'json' }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.status !== 'success') throw new Error(body.errorMessage || `HTTP ${res.status}`);
    return body.value;
  };
  return {
    name: 'convex',
    pull: (since) => call('query', 'sync:pull', { since }),
    push: ({ upserts, deletes }) => call('mutation', 'sync:push', { upserts, deletes }),
  };
}

const Store = (() => {
  const cfg = Object.assign({ backend: 'local', pollSeconds: 15 }, window.SCOREBOARD_CONFIG || {});
  const adapter = cfg.backend === 'convex' && cfg.convex?.url ? ConvexAdapter(cfg.convex) : null;
  let current = null;
  let status = adapter ? 'syncing' : 'local'; // local | syncing | ok | offline
  let loaded = !adapter;
  let lastSync = null;
  let pushTimer = null, pushing = false, pushAgain = false, pulling = false;
  const listeners = [];

  // { cursor, hashes: { players: { id: hash } , ... } } – stan ostatniej synchronizacji
  const readSync = () => {
    try { const s = JSON.parse(localStorage.getItem(SYNC_KEY)); if (s && s.url === cfg.convex?.url) return s; } catch (e) { /* brak */ }
    return { url: cfg.convex?.url, cursor: 0, hashes: {} };
  };
  const writeSync = (s) => localStorage.setItem(SYNC_KEY, JSON.stringify(s));
  const writeLocal = () => localStorage.setItem(STORE_KEY, JSON.stringify(current));
  const emit = (ev) => listeners.forEach((f) => f(ev));
  const setStatus = (s) => { if (status !== s) { status = s; emit({ type: 'status', status }); } };

  /* Co się zmieniło lokalnie względem ostatniej synchronizacji */
  function diff(db, hashes) {
    const upserts = {}, deletes = {}, now = {};
    let empty = true;
    for (const c of SHARED) {
      const prev = hashes[c] || {};
      const recs = db[c] || [];
      now[c] = {};
      upserts[c] = recs.filter((r) => { const h = hashRec(r); now[c][r.id] = h; return prev[r.id] !== h; });
      deletes[c] = Object.keys(prev).filter((id) => !(id in now[c]));
      if (upserts[c].length || deletes[c].length) empty = false;
    }
    return { upserts, deletes, now, empty };
  }

  async function push() {
    if (!adapter || !loaded) return; // najpierw pobierz stan z serwera
    if (pushing) { pushAgain = true; return; }
    const sync = readSync();
    const d = diff(current, sync.hashes);
    if (d.empty) return;
    pushing = true;
    setStatus('syncing');
    try {
      await adapter.push({ upserts: d.upserts, deletes: d.deletes });
      const s = readSync();
      for (const c of SHARED) {
        s.hashes[c] ??= {};
        for (const r of d.upserts[c]) s.hashes[c][r.id] = d.now[c][r.id];
        for (const id of d.deletes[c]) delete s.hashes[c][id];
      }
      writeSync(s);
      lastSync = Date.now();
      setStatus('ok');
    } catch (e) {
      console.warn('Wysyłanie zmian nieudane – ponowię za chwilę', e);
      setStatus('offline');
      clearTimeout(pushTimer);
      pushTimer = setTimeout(push, 15000);
    } finally {
      pushing = false;
      if (pushAgain) { pushAgain = false; push(); }
    }
  }

  async function pull() {
    if (!adapter || pulling || (loaded && document.visibilityState === 'hidden')) return;
    pulling = true;
    try {
      const sync = readSync();
      const res = await adapter.pull(sync.cursor);
      const pending = diff(current, sync.hashes);
      const merged = { ...current };
      let changed = !loaded;
      for (const c of SHARED) {
        sync.hashes[c] ??= {};
        const map = new Map((current[c] || []).map((r) => [r.id, r]));
        const mineUp = new Set(pending.upserts[c].map((r) => r.id));
        const mineDel = new Set(pending.deletes[c]);
        for (const r of res.upserts[c] || []) {
          if (!r || !r.id) continue;
          const h = hashRec(r);
          sync.hashes[c][r.id] = h;
          if (mineUp.has(r.id) || mineDel.has(r.id)) continue; // lokalna zmiana wygrywa
          const local = map.get(r.id);
          if (!local || pending.now[c][r.id] !== h) { map.set(r.id, r); changed = true; }
        }
        for (const id of res.deletes[c] || []) {
          delete sync.hashes[c][id];
          if (mineUp.has(id)) continue;
          if (map.delete(id)) changed = true;
        }
        merged[c] = [...map.values()];
      }
      sync.cursor = res.cursor;
      writeSync(sync);
      current = merged;
      writeLocal();
      loaded = true;
      lastSync = Date.now();
      setStatus('ok');
      if (changed) emit({ type: 'data', db: merged });
      push();
    } catch (e) {
      console.warn('Nie udało się pobrać danych z bazy', e);
      setStatus('offline');
      if (!loaded) { loaded = true; emit({ type: 'data', db: current }); } // pracuj na kopii lokalnej
    } finally {
      pulling = false;
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
      if (adapter) { clearTimeout(pushTimer); pushTimer = setTimeout(push, 500); }
    },
    /* Start synchronizacji (jeśli baza jest skonfigurowana) */
    init() {
      if (!adapter) return;
      pull();
      setInterval(pull, Math.max(5, cfg.pollSeconds) * 1000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); });
      window.addEventListener('online', () => { pull(); });
    },
    onChange(fn) { listeners.push(fn); },
    get remote() { return !!adapter; },
    get loaded() { return loaded; },
    get status() { return status; },
    get lastSync() { return lastSync; },
    syncNow() { return adapter ? pull() : Promise.resolve(); },
  };
})();
