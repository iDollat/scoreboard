'use strict';

/* =========================================================
   Zapisy na mecz + układanie składów
   ---------------------------------------------------------
   game   = zaplanowany mecz: { id, date, time, place, limit, status, teams, matchId }
   signup = zgłoszenie zawodnika: { id: `${gameId}:${pid}`, gameId, pid, status, by, at }
            status: 'in' (gram) | 'maybe' (może) | 'out' (nie gram)
            by:     'self' (sam się zapisał) | 'organizer' (dodany ręcznie)
   Zgłoszenia są osobnymi rekordami, żeby kilka osób mogło
   zapisywać się jednocześnie bez nadpisywania się nawzajem.
   ========================================================= */

const isOrganizer = () => !!db.settings?.organizer;
const gameById = (id) => db.games.find((g) => g.id === id);
const signupId = (gid, pid) => `${gid}:${pid}`;
const signupsOf = (gid) => db.signups.filter((s) => s.gameId === gid && playerById(s.pid));
const upcomingGames = () => db.games.filter((g) => g.status === 'open')
  .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
const me = () => (db.me && playerById(db.me) ? db.me : null);

function gameWhen(g, long = true) {
  const d = new Date(`${g.date}T${g.time || '12:00'}`);
  const day = d.toLocaleDateString('pl-PL', long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day}${g.time ? `, ${g.time}` : ''}`;
}

/* Podział zgłoszeń: grają / rezerwa (ponad limit, wg kolejności) / może / nie grają */
function signupGroups(g) {
  const list = signupsOf(g.id).sort((a, b) => a.at - b.at);
  const ins = list.filter((s) => s.status === 'in');
  const limit = +g.limit || 0;
  return {
    in: limit ? ins.slice(0, limit) : ins,
    reserve: limit ? ins.slice(limit) : [],
    maybe: list.filter((s) => s.status === 'maybe'),
    out: list.filter((s) => s.status === 'out'),
  };
}

function setSignup(g, pid, status, by) {
  const id = signupId(g.id, pid);
  const s = db.signups.find((x) => x.id === id);
  if (!status) db.signups = db.signups.filter((x) => x.id !== id);
  else if (s) {
    if (s.status !== status) { s.status = status; s.at = Date.now(); } // zmiana na „gram” = koniec kolejki
    s.by = by;
  } else db.signups.push({ id, gameId: g.id, pid, status, by, at: Date.now() });
  save();
}

/* ---------- Siła zawodnika (do wyrównywania składów) ----------
   Punkty na mecz + pół gola na mecz, „ściągnięte” do średniej,
   gdy zawodnik ma mało meczów (nowy = przeciętny). */
function playerRating() {
  const { list } = seasonStats('all');
  const totG = list.reduce((a, r) => a + r.goals, 0);
  const totP = list.reduce((a, r) => a + r.played, 0);
  const avgG = totP ? totG / totP : 0.5;
  const K = 3;
  const map = {};
  for (const r of list) map[r.pid] = (r.pts + 1.5 * K) / (r.played + K) + 0.5 * (r.goals + avgG * K) / (r.played + K);
  const def = 1.5 + 0.5 * avgG;
  return (pid) => map[pid] ?? def;
}

/* Najbardziej wyrównany podział (pełne przeszukanie do 18 osób, wyżej – zachłannie) */
function balanceTeams(pids, rate) {
  const ids = [...pids];
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const n = ids.length;
  const r = ids.map(rate);
  const total = r.reduce((a, b) => a + b, 0);
  const lineup = {};
  if (n <= 18) {
    const sizes = new Set([Math.floor(n / 2), Math.ceil(n / 2)]);
    let best = Infinity;
    const cands = [];
    for (let mask = 0; mask < (1 << n); mask++) {
      let cnt = 0, sum = 0;
      for (let i = 0; i < n; i++) if (mask & (1 << i)) { cnt++; sum += r[i]; }
      if (!sizes.has(cnt)) continue;
      const d = Math.abs(total - 2 * sum);
      if (d < best - 0.05) { best = d; cands.length = 0; }
      if (d <= best + 0.05) cands.push(mask);
    }
    const mask = cands[Math.floor(Math.random() * cands.length)] || 0;
    ids.forEach((id, i) => { lineup[id] = mask & (1 << i) ? 'A' : 'B'; });
  } else {
    const order = ids.map((id, i) => [id, r[i]]).sort((a, b) => b[1] - a[1]);
    const sum = { A: 0, B: 0 }, cnt = { A: 0, B: 0 }, max = Math.ceil(n / 2);
    for (const [id, v] of order) {
      const t = cnt.A >= max ? 'B' : cnt.B >= max ? 'A' : sum.A <= sum.B ? 'A' : 'B';
      lineup[id] = t; sum[t] += v; cnt[t]++;
    }
  }
  return lineup;
}

/* =========================================================
   WIDOKI
   ========================================================= */

function viewGames(forceList = false) {
  const games = upcomingGames();
  const org = isOrganizer();
  if (games.length === 1 && !forceList) return viewGame(games[0]);
  const card = (g) => {
    const G = signupGroups(g);
    return `<a class="mcard" href="#/zapisy/${g.id}">
      <div class="mcard-date">${esc(g.place || 'Mecz')}</div>
      <div class="game-when">${esc(gameWhen(g))}</div>
      <div class="muted small">✅ ${G.in.length}${g.limit ? `/${g.limit}` : ''} grają${G.reserve.length ? ` · ⏳ ${G.reserve.length} rezerwa` : ''}${G.maybe.length ? ` · 🤔 ${G.maybe.length}` : ''}</div>
    </a>`;
  };
  return `
  ${games.length ? `<h2 class="section-title">Najbliższe mecze</h2>${games.map(card).join('')}`
    : empty(org ? 'Nie ma zaplanowanego meczu.' : 'Nie ma jeszcze zaplanowanego meczu.<br>Organizator doda go tutaj.')}
  ${org ? '<button type="button" class="btn primary big block" data-action="game-new">📅 Zaplanuj mecz</button>' : ''}`;
}

function viewGame(g) {
  const G = signupGroups(g);
  const org = isOrganizer();
  const myId = me();
  const mine = myId && db.signups.find((s) => s.id === signupId(g.id, myId));
  const limit = +g.limit || 0;
  const pct = limit ? Math.min(100, Math.round((G.in.length / limit) * 100)) : 0;

  const row = (s, i) => `<li class="srow">
    ${i != null ? `<span class="srow-n">${i + 1}.</span>` : ''}
    <span class="srow-name">${esc(pname(s.pid))}${s.pid === myId ? ' <span class="you">Ty</span>' : ''}</span>
    ${s.by === 'organizer' ? '<span class="srow-by" title="Dodany przez organizatora">✍</span>' : ''}
    ${org ? `<button type="button" class="pmore" data-action="signup-menu" data-gid="${g.id}" data-pid="${s.pid}" aria-label="Opcje">⋯</button>` : ''}
  </li>`;
  const section = (title, list, numbered) => list.length
    ? `<section class="card"><h2 class="card-title">${title} <span class="muted">(${list.length})</span></h2><ul class="slist">${list.map((s, i) => row(s, numbered ? i : null)).join('')}</ul></section>` : '';

  const statusBtn = (st, label) => `<button type="button" class="btn st-${st} ${mine?.status === st ? 'on' : ''}" data-action="signup-me" data-gid="${g.id}" data-status="${st}">${label}</button>`;
  const meCard = myId
    ? `<section class="card me-card">
        <div class="card-head"><h2 class="card-title">Cześć, ${esc(pname(myId))}!</h2><button type="button" class="link" data-action="forget-me">To nie ja</button></div>
        <p class="muted small">${mine ? (mine.status === 'in' && G.reserve.some((s) => s.pid === myId) ? '⏳ Jesteś na liście rezerwowej.' : 'Możesz zmienić swoją odpowiedź.') : 'Zagrasz w tym meczu?'}</p>
        <div class="st-btns">${statusBtn('in', '✅ Gram')}${statusBtn('maybe', '🤔 Może')}${statusBtn('out', '❌ Nie gram')}</div>
      </section>`
    : `<section class="card me-card">
        <h2 class="card-title">Zapisz się</h2>
        <form class="inline-form" data-form="signup-self" data-gid="${g.id}" autocomplete="off">
          <input name="v" list="roster-signup" placeholder="Twoje imię" maxlength="40" enterkeyhint="go">
          <datalist id="roster-signup">${[...db.players].sort(byName).map((p) => `<option value="${esc(p.name)}">`).join('')}</datalist>
          <button class="btn primary">✅ Gram</button>
        </form>
        <p class="muted small">Zapamiętamy Cię na tym telefonie – następnym razem wystarczy jedno kliknięcie.</p>
      </section>`;

  const lineup = g.teams?.lineup || {};
  const teamList = (t) => Object.keys(lineup).filter((pid) => lineup[pid] === t && playerById(pid)).map(pname).sort((a, b) => a.localeCompare(b, 'pl'));
  const hasTeams = g.teams?.published && Object.keys(lineup).length;

  return `
  <section class="game-hero">
    <div class="game-place">${esc(g.place || 'Mecz')}</div>
    <div class="game-when">${esc(gameWhen(g))}</div>
    <div class="game-count"><b>${G.in.length}</b>${limit ? ` / ${limit}` : ''} <span>${plural(G.in.length, 'osoba gra', 'osoby grają', 'osób gra')}</span></div>
    ${limit ? `<div class="meter"><span style="width:${pct}%"></span></div>` : ''}
    ${g.note ? `<p class="game-note">${esc(g.note)}</p>` : ''}
  </section>

  ${meCard}

  ${hasTeams ? `<section class="card">
    <h2 class="card-title">Składy</h2>
    <div class="teams-preview">
      <div class="t-A"><div class="group-label"><span class="dot"></span>${esc(g.teams.A)}</div>${teamList('A').map((n) => `<div>${esc(n)}</div>`).join('')}</div>
      <div class="t-B"><div class="group-label"><span class="dot"></span>${esc(g.teams.B)}</div>${teamList('B').map((n) => `<div>${esc(n)}</div>`).join('')}</div>
    </div>
  </section>` : ''}

  ${section(`✅ Grają${limit ? ` <span class="muted small">limit ${limit}</span>` : ''}`, G.in, true)}
  ${section('⏳ Rezerwa', G.reserve, true)}
  ${section('🤔 Może', G.maybe)}
  ${section('❌ Nie grają', G.out)}

  ${org ? `<section class="card org-card">
    <h2 class="card-title">Organizator</h2>
    <div class="org-actions">
      <button type="button" class="btn" data-action="signup-add" data-gid="${g.id}">✍ Dodaj ręcznie</button>
      <a class="btn primary" href="#/sklady/${g.id}">⚖️ Ułóż składy</a>
      <button type="button" class="btn" data-action="game-edit" data-gid="${g.id}">✎ Edytuj</button>
      <button type="button" class="btn ghost danger-text" data-action="game-cancel" data-gid="${g.id}">Odwołaj</button>
    </div>
  </section>` : ''}

  <div class="btn-row">
    <button type="button" class="btn" data-action="game-share" data-gid="${g.id}">📤 Udostępnij listę</button>
    ${upcomingGames().length > 1 ? '<a class="btn ghost" href="#/zapisy/lista">Wszystkie mecze</a>' : org ? '<button type="button" class="btn ghost" data-action="game-new">+ Kolejny mecz</button>' : ''}
  </div>`;
}

function viewBuilder(g) {
  if (!isOrganizer()) return empty('Składy układa organizator.<br>Tryb organizatora włączysz w zakładce Więcej.');
  if (!g.teams) g.teams = { A: db.lastTeams.A, B: db.lastTeams.B, lineup: {}, published: false };
  const T = g.teams;
  const G = signupGroups(g);
  const pool = [...G.in, ...G.reserve].map((s) => s.pid);
  for (const pid of Object.keys(T.lineup)) if (!pool.includes(pid) || !playerById(pid)) delete T.lineup[pid];
  const rate = playerRating();

  const chip = (pid) => {
    const t = T.lineup[pid];
    return `<button type="button" class="chip ${t ? 'on-' + t : ''}" data-action="b-cycle" data-gid="${g.id}" data-pid="${pid}">${esc(pname(pid))} <small>${rate(pid).toFixed(1)}</small></button>`;
  };
  const inTeam = (t) => pool.filter((pid) => T.lineup[pid] === t).sort((a, b) => rate(b) - rate(a));
  const bench = pool.filter((pid) => !T.lineup[pid]);
  const sum = (t) => inTeam(t).reduce((a, pid) => a + rate(pid), 0);
  const sA = sum('A'), sB = sum('B');
  const share = sA + sB ? Math.round((sA / (sA + sB)) * 100) : 50;
  const reserveIds = new Set(G.reserve.map((s) => s.pid));

  const group = (t) => `<div class="lineup-group">
    <div class="group-label t-${t}"><span class="dot"></span>${esc(T[t])} <span class="muted">(${inTeam(t).length}) · siła ${sum(t).toFixed(1)}</span></div>
    <div class="chips">${inTeam(t).map(chip).join('') || '<span class="muted small">pusto</span>'}</div>
  </div>`;

  return `
  <a class="back" href="#/zapisy/${g.id}">‹ ${esc(gameWhen(g, false))}</a>
  <section class="card">
    <h2 class="card-title">Układanie składów</h2>
    <div class="vs-inputs">
      <input class="team-input t-A" data-gbind="A" data-gid="${g.id}" value="${esc(T.A)}" maxlength="20" aria-label="Nazwa drużyny 1">
      <span class="vs">vs</span>
      <input class="team-input t-B" data-gbind="B" data-gid="${g.id}" value="${esc(T.B)}" maxlength="20" aria-label="Nazwa drużyny 2">
    </div>
    <div class="balance" title="Porównanie siły drużyn">
      <span class="bal-a" style="width:${share}%"></span><span class="bal-b" style="width:${100 - share}%"></span>
    </div>
    <div class="balance-legend small"><span class="t-A">${sA.toFixed(1)}</span><span class="muted">${Math.abs(sA - sB) < 0.3 ? 'wyrównane 👌' : 'różnica ' + Math.abs(sA - sB).toFixed(1)}</span><span class="t-B">${sB.toFixed(1)}</span></div>
  </section>

  <section class="card">
    <div class="card-head">
      <h2 class="card-title">Zawodnicy</h2>
      <div class="mini-actions">
        <button type="button" class="link" data-action="b-balance" data-gid="${g.id}">⚖️ Wyrównaj</button>
        <button type="button" class="link" data-action="b-clear" data-gid="${g.id}">Wyczyść</button>
      </div>
    </div>
    <p class="muted small">Dotknij zawodnika: ${esc(T.A)} → ${esc(T.B)} → ławka. Liczba przy imieniu to siła wyliczona z wyników (punkty i gole na mecz).</p>
    ${group('A')}
    ${group('B')}
    ${bench.length ? `<div class="lineup-group">
      <div class="group-label"><span class="dot"></span>Bez drużyny <span class="muted">(${bench.length})</span></div>
      <div class="chips">${bench.map((pid) => chip(pid).replace('</button>', reserveIds.has(pid) ? ' <small>rez.</small></button>' : '</button>')).join('')}</div>
    </div>` : ''}
    ${pool.length ? '' : '<p class="muted">Nikt się jeszcze nie zapisał.</p>'}
    <button type="button" class="btn ghost block add-gap" data-action="signup-add" data-gid="${g.id}">✍ Dodaj zawodnika spoza zapisów</button>
  </section>

  <div class="btn-row">
    <button type="button" class="btn" data-action="b-publish" data-gid="${g.id}">${T.published ? '✓ Składy widoczne' : '👁 Pokaż wszystkim'}</button>
    <button type="button" class="btn" data-action="b-share" data-gid="${g.id}">📤 Udostępnij</button>
  </div>
  <button type="button" class="btn primary big block" data-action="b-start" data-gid="${g.id}">▶ Rozpocznij mecz z tymi składami</button>`;
}

/* ---------- Teksty do udostępnienia ---------- */
function gameShareText(g) {
  const G = signupGroups(g);
  const names = (l) => l.map((s, i) => `${i + 1}. ${pname(s.pid)}`).join('\n');
  const lines = [`📅 ${g.place ? g.place + ' – ' : ''}${gameWhen(g)}`, '', `✅ Grają (${G.in.length}${g.limit ? '/' + g.limit : ''}):`, names(G.in) || '—'];
  if (G.reserve.length) lines.push('', '⏳ Rezerwa:', names(G.reserve));
  if (G.maybe.length) lines.push('', `🤔 Może: ${G.maybe.map((s) => pname(s.pid)).join(', ')}`);
  lines.push('', `Zapisy: ${location.origin}${location.pathname}#/zapisy/${g.id}`);
  return lines.join('\n');
}
function teamsShareText(g) {
  const T = g.teams;
  const list = (t) => Object.keys(T.lineup).filter((p) => T.lineup[p] === t).map(pname).sort((a, b) => a.localeCompare(b, 'pl')).join(', ');
  return `⚽ Składy – ${gameWhen(g)}\n\n${T.A}: ${list('A') || '—'}\n${T.B}: ${list('B') || '—'}`;
}

/* ---------- Formularz meczu (nowy / edycja) ---------- */
function gameForm(g) {
  const today = new Date();
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const last = [...db.games].sort((a, b) => b.createdAt - a.createdAt)[0];
  const v = g || { date: iso(today), time: last?.time || '19:00', place: last?.place || '', limit: last?.limit || '', note: '' };
  return new Promise((resolve) => {
    openSheet(`
      <h3>${g ? 'Edytuj mecz' : 'Zaplanuj mecz'}</h3>
      <form class="stack-form">
        <div class="two"><label>Data<input type="date" name="date" value="${esc(v.date)}" required></label>
        <label>Godzina<input type="time" name="time" value="${esc(v.time)}"></label></div>
        <label>Miejsce<input name="place" value="${esc(v.place)}" maxlength="60" placeholder="np. Orlik przy szkole"></label>
        <label>Limit miejsc<input type="number" name="limit" value="${esc(v.limit)}" min="0" max="60" inputmode="numeric" placeholder="bez limitu"></label>
        <label>Notatka<input name="note" value="${esc(v.note || '')}" maxlength="120" placeholder="np. zrzutka 10 zł, weź jasną i ciemną koszulkę"></label>
        <button class="btn primary big">${g ? 'Zapisz' : 'Utwórz i otwórz zapisy'}</button>
      </form>`,
      (panel, close) => {
        const f = panel.querySelector('form');
        f.onsubmit = (ev) => {
          ev.preventDefault();
          close({ date: f.date.value, time: f.time.value, place: norm(f.place.value), limit: Math.max(0, parseInt(f.limit.value, 10) || 0), note: norm(f.note.value) });
        };
      }, resolve);
  });
}

/* =========================================================
   AKCJE
   ========================================================= */
const gameActions = {
  async 'game-new'() {
    const v = await gameForm(null);
    if (!v) return;
    const g = { id: uid(), ...v, status: 'open', createdAt: Date.now(), teams: null, matchId: null };
    db.games.push(g);
    save();
    location.hash = `#/zapisy/${g.id}`;
    toast('📅 Mecz zaplanowany – udostępnij link do zapisów');
  },
  async 'game-edit'({ gid }) {
    const g = gameById(gid);
    const v = await gameForm(g);
    if (!v) return;
    Object.assign(g, v);
    save(); render();
  },
  async 'game-cancel'({ gid }) {
    if (!(await confirmBox('Odwołać mecz?', 'Mecz i wszystkie zgłoszenia zostaną usunięte.', 'Odwołaj mecz'))) return;
    db.games = db.games.filter((g) => g.id !== gid);
    db.signups = db.signups.filter((s) => s.gameId !== gid);
    save();
    location.hash = '#/zapisy';
  },
  'game-share'({ gid }) { shareOrCopy(gameShareText(gameById(gid))); },

  'signup-me'({ gid, status }) {
    const g = gameById(gid);
    setSignup(g, me(), status, 'self');
    buzz(); render();
    toast(status === 'in' ? '✅ Zapisano – do zobaczenia na boisku!' : status === 'maybe' ? '🤔 Zapisano jako „może”' : '❌ Zapisano – nie grasz');
  },
  'forget-me'() { db.me = null; save(); render(); },

  async 'signup-menu'({ gid, pid }) {
    const g = gameById(gid);
    const a = await choose(pname(pid), 'Zmień zgłoszenie', [
      { label: '✅ Gra', value: 'in' }, { label: '🤔 Może', value: 'maybe' }, { label: '❌ Nie gra', value: 'out' },
      { label: 'Usuń z listy', value: 'remove', cls: 'ghost danger-text' },
    ]);
    if (!a) return;
    setSignup(g, pid, a === 'remove' ? null : a, 'organizer');
    render();
  },
  'signup-add'({ gid }) {
    const g = gameById(gid);
    const signed = new Set(signupsOf(gid).filter((s) => s.status === 'in').map((s) => s.pid));
    const avail = db.players.filter((p) => !signed.has(p.id)).sort(byName);
    openSheet(`
      <h3>Dodaj ręcznie</h3>
      <p class="muted small">Dla osób, które nie zapisały się same, a wiadomo, że zagrają.</p>
      <form class="inline-form">
        <input name="v" placeholder="Imię zawodnika" maxlength="40" autocomplete="off" enterkeyhint="done">
        <button class="btn primary">Dodaj</button>
      </form>
      ${avail.length ? `<p class="muted small">Albo wybierz (możesz kilku):</p><div class="chips">${avail.map((p) => `<button type="button" class="chip" data-pick="${p.id}">${esc(p.name)}</button>`).join('')}</div>` : ''}`,
      (panel, close) => {
        const f = panel.querySelector('form');
        setTimeout(() => f.v.focus(), 80);
        f.onsubmit = (ev) => {
          ev.preventDefault();
          const p = ensurePlayer(f.v.value);
          if (!p) return;
          setSignup(g, p.id, 'in', 'organizer');
          render(); close(); toast(`✍ ${p.name} dopisany do meczu`);
        };
        panel.querySelectorAll('[data-pick]').forEach((b) => {
          b.onclick = () => { setSignup(g, b.dataset.pick, 'in', 'organizer'); render(); b.remove(); };
        });
      });
  },

  /* --- układanie składów --- */
  'b-cycle'({ gid, pid }) {
    const T = gameById(gid).teams;
    const t = T.lineup[pid];
    if (!t) T.lineup[pid] = 'A'; else if (t === 'A') T.lineup[pid] = 'B'; else delete T.lineup[pid];
    save(); render();
  },
  'b-balance'({ gid }) {
    const g = gameById(gid);
    const G = signupGroups(g);
    const assigned = Object.keys(g.teams.lineup);
    // wyrównujemy przypisanych; jeśli nikt nie jest przypisany – wszystkich z listy „grają”
    const pids = assigned.length >= 2 ? assigned : G.in.map((s) => s.pid);
    if (pids.length < 2) return toast('Za mało zawodników');
    g.teams.lineup = balanceTeams(pids, playerRating());
    save(); render(); toast('⚖️ Składy wyrównane – kliknij ponownie, żeby dostać inny wariant');
  },
  'b-clear'({ gid }) { gameById(gid).teams.lineup = {}; save(); render(); },
  'b-publish'({ gid }) {
    const T = gameById(gid).teams;
    T.published = !T.published;
    save(); render(); toast(T.published ? '👁 Składy widoczne w zapisach' : 'Składy ukryte');
  },
  'b-share'({ gid }) { shareOrCopy(teamsShareText(gameById(gid))); },
  async 'b-start'({ gid }) {
    const g = gameById(gid);
    if (activeMatch()) return toast('Najpierw zakończ trwający mecz');
    const n = Object.keys(g.teams.lineup).length;
    if (!n && !(await confirmBox('Brak składów', 'Zacząć mecz bez przypisanych zawodników?', 'Zacznij', 'primary'))) return;
    db.draft = { A: g.teams.A, B: g.teams.B, lineup: { ...g.teams.lineup } };
    actions.start();
    g.status = 'played';
    g.matchId = db.activeId;
    save();
  },
};

/* Nazwy drużyn w układaniu składów – zapis bez przerysowania ekranu */
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (!t.dataset.gbind) return;
  const g = gameById(t.dataset.gid);
  if (g?.teams) { g.teams[t.dataset.gbind] = t.value; save(); }
});
