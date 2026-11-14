'use strict';

/* =========================================================
   Scoreboard – licznik meczu, strzelców i statystyk sezonu
   Wszystkie dane trzymane są w localStorage przeglądarki.
   ========================================================= */

const $ = (s, r = document) => r.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const other = (t) => (t === 'A' ? 'B' : 'A');
const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ');
const same = (a, b) => a.localeCompare(b, 'pl', { sensitivity: 'base' }) === 0;
const byName = (a, b) => a.name.localeCompare(b.name, 'pl');
const plural = (n, one, few, many) => {
  if (n === 1) return one;
  const d = n % 10, h = n % 100;
  return d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many;
};
const goalsWord = (n) => `${n} ${plural(n, 'gol', 'gole', 'goli')}`;

/* ---------- Baza danych ---------- */
function freshDb() {
  const y = String(new Date().getFullYear());
  return {
    version: 2,
    // współdzielone (po podpięciu bazy trafią do niej)
    players: [], matches: [], games: [], signups: [],
    // tylko na tym urządzeniu
    seasons: [y], season: y, activeId: null, draft: null, lastTeams: { A: 'Biali', B: 'Czarni' },
    me: null, settings: { organizer: !Store.remote },
  };
}
let db = Store.load(freshDb);
let viewSeason = db.season;
let statsSort = 'pts';
let justFinished = null;

function save() {
  try { Store.save(db); }
  catch (e) { toast('⚠️ Nie udało się zapisać danych'); }
}

/* ---------- Zawodnicy ---------- */
const playerById = (id) => db.players.find((p) => p.id === id);
const pname = (id) => playerById(id)?.name ?? '?';
const findPlayer = (name) => db.players.find((p) => same(p.name, name));
function ensurePlayer(name) {
  name = norm(name);
  if (!name) return null;
  let p = findPlayer(name);
  if (!p) { p = { id: uid(), name }; db.players.push(p); }
  return p;
}

/* ---------- Mecz ---------- */
const matchById = (id) => db.matches.find((m) => m.id === id);
function activeMatch() {
  const m = db.activeId && matchById(db.activeId);
  return m && m.status === 'live' ? m : null;
}
function elapsed(m) {
  const end = m.endedAt || m.pausedAt || Date.now();
  return Math.max(0, end - m.startedAt - (m.pausedMs || 0));
}
const fmtClock = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const minute = (ms) => `${Math.floor(ms / 60000) + 1}'`;
const fmtDate = (ts, opts) => new Date(ts).toLocaleDateString('pl-PL', opts || { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const beneficiary = (e) => (e.own ? other(e.team) : e.team); // drużyna, której liczy się gol

function score(m) {
  const s = { A: 0, B: 0 };
  for (const e of m.events) if (e.type === 'goal') s[beneficiary(e)]++;
  return s;
}
function playerGoals(m, pid) {
  let g = 0, o = 0;
  for (const e of m.events) if (e.type === 'goal' && e.pid === pid) (e.own ? o++ : g++);
  return { g, o };
}
const switchedIn = (m, pid) => m.events.some((e) => e.type === 'switch' && e.pid === pid);

/* Pełne podsumowanie meczu – używane w podsumowaniu, historii i statystykach */
function summarize(m) {
  const s = score(m);
  const winner = s.A > s.B ? 'A' : s.B > s.A ? 'B' : null;
  const stats = {};
  const P = (pid) => (stats[pid] ??= { pid, goals: { A: 0, B: 0 }, own: 0, total: 0, team: m.lineup[pid] ?? null, switched: false });
  Object.keys(m.lineup).forEach(P);

  const run = { A: 0, B: 0 };
  const maxLead = { A: 0, B: 0 };
  const timeline = [];
  const scorers = { A: [], B: [] }; // [{pid, n, own}]
  let decisive = null, firstGoal = null;

  for (const e of m.events) {
    if (e.type === 'switch') {
      P(e.pid).switched = true;
      timeline.push({ ...e, run: { ...run } });
      continue;
    }
    if (e.type !== 'goal') continue;
    const p = P(e.pid);
    if (e.own) p.own++; else { p.goals[e.team]++; p.total++; }
    const t = beneficiary(e);
    const before = run[t] - run[other(t)];
    run[t]++;
    if (winner && t === winner && before === 0) decisive = e;
    const diff = run.A - run.B;
    maxLead.A = Math.max(maxLead.A, diff);
    maxLead.B = Math.max(maxLead.B, -diff);
    firstGoal ??= e;
    const row = scorers[t].find((x) => x.pid === e.pid && x.own === !!e.own);
    if (row) row.n++; else scorers[t].push({ pid: e.pid, n: 1, own: !!e.own });
    timeline.push({ ...e, run: { ...run } });
  }
  const players = Object.values(stats).sort((a, b) => b.total - a.total || pname(a.pid).localeCompare(pname(b.pid), 'pl'));
  const topN = players[0]?.total || 0;
  return {
    s, winner, players, timeline, maxLead, decisive, firstGoal, scorers,
    total: s.A + s.B,
    top: topN ? players.filter((p) => p.total === topN) : [],
    comeback: winner ? maxLead[other(winner)] : 0,
    duration: elapsed(m),
  };
}

/* ---------- UI: toast, arkusze, potwierdzenia ---------- */
let toastTimer;
function toast(msg, undoFn) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undoFn ? '<button type="button">Cofnij</button>' : ''}`;
  el.classList.add('show');
  if (undoFn) el.querySelector('button').onclick = () => { undoFn(); el.classList.remove('show'); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), undoFn ? 5000 : 2500);
}

function openSheet(html, onMount, onClose) {
  const root = $('#sheet');
  root.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet-panel" role="dialog"><div class="sheet-grip"></div>${html}</div>`;
  requestAnimationFrame(() => root.classList.add('open'));
  let closed = false;
  const close = (val = null) => {
    if (closed) return;
    closed = true;
    root.classList.remove('open');
    setTimeout(() => {
      if (!root.classList.contains('open')) root.innerHTML = '';
      // zmiany od innych, które przyszły, gdy okienko było otwarte
      if (renderPending && !busy()) { renderPending = false; render(); }
    }, 250);
    onClose?.(val);
  };
  root.querySelector('.sheet-backdrop').onclick = () => close(null);
  onMount?.(root.querySelector('.sheet-panel'), close);
  return close;
}

function choose(title, text, options) {
  return new Promise((resolve) => {
    openSheet(
      `<h3>${esc(title)}</h3>${text ? `<p class="muted">${esc(text)}</p>` : ''}
       <div class="sheet-actions">
         ${options.map((o, i) => `<button type="button" class="btn ${o.cls || ''}" data-i="${i}">${esc(o.label)}</button>`).join('')}
         <button type="button" class="btn ghost" data-i="-1">Anuluj</button>
       </div>`,
      (panel, close) => {
        panel.querySelectorAll('[data-i]').forEach((b) => {
          b.onclick = () => { const i = +b.dataset.i; close(i < 0 ? null : options[i].value); };
        });
      },
      resolve
    );
  });
}
const confirmBox = (title, text, label = 'Tak', cls = 'danger') => choose(title, text, [{ label, value: true, cls }]);

function askText(title, value = '', placeholder = '') {
  return new Promise((resolve) => {
    openSheet(
      `<h3>${esc(title)}</h3>
       <form class="inline-form">
         <input name="v" value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="40" autocomplete="off">
         <button class="btn primary">OK</button>
       </form>`,
      (panel, close) => {
        const f = panel.querySelector('form');
        setTimeout(() => { f.v.focus(); f.v.select(); }, 80);
        f.onsubmit = (ev) => { ev.preventDefault(); close(norm(f.v.value) || null); };
      },
      resolve
    );
  });
}

const buzz = () => navigator.vibrate?.(35);

/* Udostępnianie: systemowe menu (np. WhatsApp), a gdy go nie ma – schowek */
async function shareOrCopy(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); toast('📋 Skopiowano – wklej np. na grupę'); }
  catch (e) {
    openSheet(`<h3>Skopiuj tekst</h3><textarea class="share-text" readonly>${esc(text)}</textarea>`,
      (panel) => { const t = panel.querySelector('textarea'); t.focus(); t.select(); });
  }
}

/* ---------- Blokada wygaszania ekranu podczas meczu ---------- */
let wakeLock = null, wantAwake = false;
async function keepAwake(on) {
  wantAwake = on;
  try {
    if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { /* brak wsparcia – trudno */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { keepAwake(wantAwake); render(); } });

/* =========================================================
   WIDOKI
   ========================================================= */

function route() {
  const [view, id] = location.hash.replace(/^#\/?/, '').split('/');
  return { view: view || 'mecz', id };
}

function render() {
  const { view, id } = route();
  const live = activeMatch();
  let html;
  if (view === 'mecz') {
    if (id && !(live && live.id === id)) {
      const m = matchById(id);
      html = m ? viewSummary(m) : empty('Nie znaleziono meczu.');
    } else html = live ? viewLive(live) : viewSetup();
  } else if (view === 'zapisy') {
    const g = id && id !== 'lista' && gameById(id);
    html = g ? viewGame(g) : id && id !== 'lista' && !Store.loaded ? loading() : viewGames(id === 'lista');
  } else if (view === 'zaproszenie') html = acceptInvite(id);
  else if (view === 'odpowiedz') html = acceptReply(id);
  else if (view === 'sklady') {
    const g = gameById(id);
    html = g ? viewBuilder(g) : empty('Nie znaleziono meczu.');
  } else if (view === 'historia') html = viewHistory();
  else if (view === 'statystyki') html = viewStats();
  else if (view === 'wiecej') html = viewMore();
  else html = live ? viewLive(live) : viewSetup();

  $('#app').innerHTML = html;
  const tab = view === 'sklady' ? 'zapisy' : view;
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  document.querySelector('.tabbar [data-tab="mecz"]').classList.toggle('live', !!live);
  $('#season-pill').textContent = `Sezon ${db.season}`;
  keepAwake(view === 'mecz' && !!live && !(id && id !== live.id));

  if (justFinished && id === justFinished) { justFinished = null; confetti(); }
}

const loading = () => '<div class="empty"><div class="empty-ball">⚽</div><p>Wczytywanie…</p></div>';
const empty = (text, extra = '') => `<div class="empty"><div class="empty-ball">⚽</div><p>${text}</p>${extra}</div>`;

/* ---------- Nowy mecz ---------- */
function getDraft() {
  if (!db.draft) db.draft = { A: db.lastTeams.A, B: db.lastTeams.B, lineup: {} };
  return db.draft;
}
function appearances() {
  const c = {};
  for (const m of db.matches) for (const pid in m.lineup) c[pid] = (c[pid] || 0) + 1;
  return c;
}

function viewSetup() {
  const d = getDraft();
  const apps = appearances();
  const players = [...db.players].sort((a, b) => (apps[b.id] || 0) - (apps[a.id] || 0) || byName(a, b));
  const chip = (p) => {
    const t = d.lineup[p.id];
    return `<button type="button" class="chip ${t ? 'on-' + t : ''}" data-action="cycle" data-pid="${p.id}">${esc(p.name)}</button>`;
  };
  const group = (t) => {
    const list = players.filter((p) => d.lineup[p.id] === t);
    return `<div class="lineup-group">
      <div class="group-label t-${t}"><span class="dot"></span>${esc(d[t])} <span class="muted">(${list.length})</span></div>
      <div class="chips">${list.map(chip).join('') || '<span class="muted small">brak zawodników</span>'}</div>
    </div>`;
  };
  const bench = players.filter((p) => !d.lineup[p.id]);

  const planned = db.games.find((g) => g.status === 'open' && g.teams && Object.keys(g.teams.lineup).length);
  return `
  ${planned ? `<button type="button" class="banner" data-action="b-start" data-gid="${planned.id}">
    <span>⚖️ Są ułożone składy na ${esc(gameWhen(planned, false))}</span><b>Zacznij ›</b></button>` : ''}
  <section class="card">
    <h2 class="card-title">Nowy mecz</h2>
    <div class="vs-inputs">
      <input class="team-input t-A" data-bind="A" value="${esc(d.A)}" maxlength="20" aria-label="Nazwa drużyny 1">
      <span class="vs">vs</span>
      <input class="team-input t-B" data-bind="B" value="${esc(d.B)}" maxlength="20" aria-label="Nazwa drużyny 2">
    </div>
  </section>

  <section class="card">
    <div class="card-head">
      <h2 class="card-title">Składy</h2>
      <div class="mini-actions">
        <button type="button" class="link" data-action="shuffle">🎲 Losuj</button>
        <button type="button" class="link" data-action="last-lineup">↺ Jak ostatnio</button>
      </div>
    </div>
    ${players.length ? '<p class="muted small">Dotknij zawodnika, żeby przenieść go do kolejnej drużyny albo poza mecz.</p>' : ''}
    ${group('A')}
    ${group('B')}
    ${bench.length ? `<div class="lineup-group">
      <div class="group-label"><span class="dot"></span>Poza meczem <span class="muted">(${bench.length})</span></div>
      <div class="chips">${bench.map(chip).join('')}</div>
    </div>` : ''}
    <form class="inline-form" data-form="setup-add">
      <input name="v" placeholder="Nowy zawodnik…" maxlength="40" autocomplete="off" enterkeyhint="done">
      <button class="btn">Dodaj</button>
    </form>
  </section>

  <button type="button" class="btn primary big block" data-action="start">▶ Rozpocznij mecz</button>
  <p class="muted small center">Składy nie są obowiązkowe – zawodników dopiszesz też w trakcie meczu.</p>`;
}

/* ---------- Mecz na żywo ---------- */
function viewLive(m) {
  const s = score(m);
  const runningScore = {};
  { const r = { A: 0, B: 0 }; for (const e of m.events) if (e.type === 'goal') { r[beneficiary(e)]++; runningScore[e.id] = `${r.A}:${r.B}`; } }

  const column = (t) => {
    const pids = Object.keys(m.lineup).filter((pid) => m.lineup[pid] === t)
      .map((pid) => ({ pid, ...playerGoals(m, pid) }))
      .sort((a, b) => b.g - a.g || pname(a.pid).localeCompare(pname(b.pid), 'pl'));
    return `<div class="col t-${t}">
      <div class="col-head"><span class="dot"></span><span class="col-name">${esc(m.teams[t])}</span><span class="muted">${pids.length}</span></div>
      ${pids.map(({ pid, g, o }) => `
        <div class="prow" data-action="goal" data-pid="${pid}" role="button" tabindex="0">
          <span class="pname">${esc(pname(pid))}${switchedIn(m, pid) ? ' <span class="swap" title="Zmienił drużynę">⇄</span>' : ''}</span>
          <span class="pgoals">${g ? `⚽${g > 1 ? g : ''}` : ''}${o ? ` <span class="own">🙈${o > 1 ? o : ''}</span>` : ''}</span>
          <button type="button" class="pmore" data-action="player-menu" data-pid="${pid}" aria-label="Opcje">⋯</button>
        </div>`).join('')}
      <button type="button" class="add-row" data-action="add-to-team" data-team="${t}">+ zawodnik</button>
    </div>`;
  };

  const events = [...m.events].reverse();
  return `
  <section class="board ${m.pausedAt ? 'paused' : ''}">
    <button type="button" class="board-team t-A" data-action="rename-team" data-team="A">${esc(m.teams.A)}</button>
    <div class="board-clock">
      <span id="timer" class="clock">${fmtClock(elapsed(m))}</span>
      <button type="button" class="pause" data-action="pause">${m.pausedAt ? '▶ wznów' : '❚❚ pauza'}</button>
    </div>
    <button type="button" class="board-team t-B" data-action="rename-team" data-team="B">${esc(m.teams.B)}</button>
    <div class="board-score t-A" id="score-A">${s.A}</div>
    <div class="board-sep">:</div>
    <div class="board-score t-B" id="score-B">${s.B}</div>
  </section>

  <form class="quick card" data-form="quick" autocomplete="off">
    <input id="quick-name" name="v" list="roster" placeholder="Kto strzelił? Wpisz imię…" maxlength="40" enterkeyhint="go">
    <datalist id="roster">${[...db.players].sort(byName).map((p) => `<option value="${esc(p.name)}">`).join('')}</datalist>
    <div class="quick-btns">
      <button type="button" class="btn team t-A" data-action="quick-goal" data-team="A">⚽ ${esc(m.teams.A)}</button>
      <button type="button" class="btn team t-B" data-action="quick-goal" data-team="B">⚽ ${esc(m.teams.B)}</button>
    </div>
  </form>

  <section class="cols">${column('A')}${column('B')}</section>
  <p class="muted small center">Dotknij zawodnika = gol. <b>⋯</b> = samobój, zmiana drużyny.</p>

  <section class="card">
    <div class="card-head">
      <h2 class="card-title">Przebieg</h2>
      ${events.length ? '<button type="button" class="link" data-action="undo">↶ Cofnij ostatnie</button>' : ''}
    </div>
    ${events.length ? `<ul class="events">${events.map((e) => eventRow(m, e, runningScore[e.id], true)).join('')}</ul>` : '<p class="muted small">Jeszcze nic się nie wydarzyło.</p>'}
  </section>

  <button type="button" class="btn danger block" data-action="finish">🏁 Zakończ mecz</button>`;
}

function eventRow(m, e, run, deletable) {
  const side = e.type === 'goal' ? beneficiary(e) : e.to;
  let body;
  if (e.type === 'goal') body = `${e.own ? '🙈' : '⚽'} <b>${esc(pname(e.pid))}</b>${e.own ? ' <span class="muted">(samobój)</span>' : ''}`;
  else body = `⇄ <b>${esc(pname(e.pid))}</b> <span class="muted">→ ${esc(m.teams[e.to])}</span>`;
  return `<li class="ev side-${side}">
    <span class="ev-min">${minute(e.t)}</span>
    <span class="ev-bar t-${side}"></span>
    <span class="ev-body">${body}</span>
    ${run ? `<span class="ev-run">${run}</span>` : '<span class="ev-run"></span>'}
    ${deletable ? `<button type="button" class="ev-del" data-action="del-event" data-id="${e.id}" aria-label="Usuń">×</button>` : ''}
  </li>`;
}

/* ---------- Podsumowanie meczu ---------- */
function viewSummary(m) {
  const S = summarize(m);
  const { s, winner } = S;
  const T = m.teams;
  const scorerList = (t) => S.scorers[t].map((x) =>
    `<span>${esc(pname(x.pid))}${x.n > 1 ? ` ×${x.n}` : ''}${x.own ? ' <i>(sam.)</i>' : ''}</span>`).join('');

  const hi = [];
  if (S.top.length) hi.push(['👑', 'Król strzelców', `${S.top.map((p) => esc(pname(p.pid))).join(', ')} – ${goalsWord(S.top[0].total)}`]);
  for (const p of S.players.filter((x) => x.total >= 3)) {
    const lbl = p.total === 3 ? 'Hat-trick' : p.total === 4 ? 'Poker' : `${p.total} goli w meczu!`;
    hi.push(['🎩', lbl, esc(pname(p.pid))]);
  }
  if (S.comeback) hi.push(['🔥', 'Comeback', `${esc(T[winner])} odrobili stratę ${S.comeback} ${S.comeback === 1 ? 'gola' : 'goli'}`]);
  if (S.decisive && S.total > 1) hi.push(['🎯', 'Gol na wagę zwycięstwa', `${esc(pname(S.decisive.pid))}${S.decisive.own ? ' (samobój)' : ''}, ${minute(S.decisive.t)}`]);
  if (S.firstGoal) hi.push(['🥇', 'Pierwszy gol', `${esc(pname(S.firstGoal.pid))}${S.firstGoal.own ? ' (samobój)' : ''}, ${minute(S.firstGoal.t)}`]);
  const leadT = S.maxLead.A >= S.maxLead.B ? 'A' : 'B';
  if (S.maxLead[leadT] >= 3) hi.push(['📈', 'Najwyższe prowadzenie', `${esc(T[leadT])} +${S.maxLead[leadT]}`]);
  const switched = S.players.filter((p) => p.switched);
  if (switched.length) hi.push(['⇄', 'Zmiany drużyn', switched.map((p) => esc(pname(p.pid))).join(', ')]);
  const owns = S.players.reduce((a, p) => a + p.own, 0);
  if (owns) hi.push(['🙈', 'Samobóje', String(owns)]);
  hi.push(['⏱', 'Czas gry', `${Math.max(1, Math.round(S.duration / 60000))} min · ${goalsWord(S.total)}`]);

  const teamCell = (p) => {
    if (p.switched) {
      const parts = ['A', 'B'].filter((t) => p.goals[t]).map((t) => `<span class="tag t-${t}">${esc(T[t])} ${p.goals[t]}</span>`).join(' ');
      return `<span class="muted small">⇄ teraz: ${esc(T[p.team] ?? '–')}</span> ${parts}`;
    }
    return p.team ? `<span class="tag t-${p.team}">${esc(T[p.team])}</span>` : '';
  };
  const resultFor = (p) => !p.team ? '' : !winner ? 'r' : p.team === winner ? 'w' : 'l';

  const isLiveElsewhere = !!activeMatch();
  return `
  <section class="hero ${winner ? 'win-' + winner : 'draw'}">
    <div class="hero-date">${fmtDate(m.startedAt)} · sezon ${esc(m.season)}</div>
    <div class="hero-score">
      <div class="hero-team t-A ${winner === 'A' ? 'won' : ''}"><span>${esc(T.A)}</span><b>${s.A}</b></div>
      <div class="hero-sep">:</div>
      <div class="hero-team t-B ${winner === 'B' ? 'won' : ''}"><b>${s.B}</b><span>${esc(T.B)}</span></div>
    </div>
    <div class="hero-result">${m.status === 'live' ? `<span class="live-dot"></span> Na żywo · ${minute(S.duration)}` : winner ? `🏆 Wygrywają ${esc(T[winner])}` : '🤝 Remis'}</div>
    <div class="hero-scorers">
      <div class="t-A">${scorerList('A')}</div>
      <div class="t-B">${scorerList('B')}</div>
    </div>
  </section>

  <section class="highlights">
    ${hi.map(([icon, label, val]) => `<div class="hl"><div class="hl-icon">${icon}</div><div><div class="hl-label">${label}</div><div class="hl-val">${val}</div></div></div>`).join('')}
  </section>

  ${S.players.length ? `<section class="card">
    <h2 class="card-title">Zawodnicy</h2>
    <table class="table">
      <thead><tr><th class="l">Zawodnik</th><th class="l">Drużyna</th><th>⚽</th></tr></thead>
      <tbody>${S.players.map((p) => `<tr>
        <td class="l"><span class="res res-${resultFor(p)}"></span>${esc(pname(p.pid))}</td>
        <td class="l">${teamCell(p)}</td>
        <td><b>${p.total || ''}</b>${p.own ? ` <span class="muted small">🙈${p.own}</span>` : ''}</td></tr>`).join('')}
      </tbody>
    </table>
  </section>` : ''}

  ${S.timeline.length ? `<section class="card">
    <h2 class="card-title">Przebieg meczu</h2>
    <ul class="events">${S.timeline.map((e) => eventRow(m, e, e.type === 'goal' ? `${e.run.A}:${e.run.B}` : '', false)).join('')}</ul>
  </section>` : ''}

  <div class="btn-row">
    <button type="button" class="btn primary" data-action="share" data-id="${m.id}">📤 Udostępnij</button>
    <a class="btn" href="#/mecz">⚽ Nowy mecz</a>
  </div>
  ${m.status === 'live' ? '<p class="muted small center">Wynik odświeża się sam co kilkanaście sekund.</p>' : `<div class="btn-row">
    ${isLiveElsewhere ? '' : `<button type="button" class="btn ghost" data-action="reopen" data-id="${m.id}">↺ Wznów mecz</button>`}
    <button type="button" class="btn ghost danger-text" data-action="delete-match" data-id="${m.id}">🗑 Usuń</button>
  </div>`}`;
}

function shareText(m) {
  const S = summarize(m);
  const T = m.teams;
  const list = (t) => S.scorers[t].map((x) => `${pname(x.pid)}${x.n > 1 ? ` x${x.n}` : ''}${x.own ? ' (sam.)' : ''}`).join(', ');
  const lines = [
    `⚽ ${T.A} ${S.s.A} : ${S.s.B} ${T.B}`,
    `📅 ${fmtDate(m.startedAt)} · ${Math.max(1, Math.round(S.duration / 60000))} min`,
    '',
  ];
  if (S.scorers.A.length) lines.push(`${T.A}: ${list('A')}`);
  if (S.scorers.B.length) lines.push(`${T.B}: ${list('B')}`);
  if (S.top.length) lines.push('', `👑 Król strzelców: ${S.top.map((p) => pname(p.pid)).join(', ')} (${S.top[0].total})`);
  lines.push(S.winner ? `🏆 Wygrywają ${T[S.winner]}` : '🤝 Remis');
  return lines.join('\n');
}

/* ---------- Wybór sezonu ---------- */
const allSeasons = () => [...new Set([...db.seasons, ...db.matches.map((m) => m.season).filter(Boolean)])].sort().reverse();
function seasonPicker() {
  const opts = allSeasons();
  if (!opts.includes(viewSeason) && viewSeason !== 'all') viewSeason = db.season;
  return `<div class="seg">${opts.map((s) => `<button type="button" class="${s === viewSeason ? 'on' : ''}" data-action="view-season" data-season="${esc(s)}">${esc(s)}</button>`).join('')}
    <button type="button" class="${viewSeason === 'all' ? 'on' : ''}" data-action="view-season" data-season="all">Wszystkie</button></div>`;
}
const seasonMatches = (season) => db.matches.filter((m) => m.status === 'done' && (season === 'all' || m.season === season));

/* Mecze na żywo prowadzone na innych telefonach (widoczne przy wspólnej bazie) */
const othersLive = () => db.matches.filter((m) => m.status === 'live' && m.id !== db.activeId && Date.now() - m.startedAt < 6 * 3600e3)
  .sort((a, b) => b.startedAt - a.startedAt);

/* ---------- Historia ---------- */
function viewHistory() {
  const live = activeMatch();
  const list = seasonMatches(viewSeason).sort((a, b) => b.startedAt - a.startedAt);
  const card = (m) => {
    const S = summarize(m);
    const sc = (t) => S.scorers[t].map((x) => `${esc(pname(x.pid))}${x.n > 1 ? ` ×${x.n}` : ''}${x.own ? ' (s.)' : ''}`).join(', ');
    return `<a class="mcard" href="#/mecz/${m.id}">
      <div class="mcard-date">${fmtDate(m.startedAt)}${viewSeason === 'all' ? ` · ${esc(m.season)}` : ''}</div>
      <div class="mcard-score">
        <span class="t-A ${S.winner === 'A' ? 'won' : ''}">${esc(m.teams.A)}</span>
        <b>${S.s.A}:${S.s.B}</b>
        <span class="t-B ${S.winner === 'B' ? 'won' : ''}">${esc(m.teams.B)}</span>
      </div>
      ${S.total ? `<div class="mcard-scorers"><span>${sc('A')}</span><span>${sc('B')}</span></div>` : ''}
    </a>`;
  };
  return `
  ${seasonPicker()}
  ${live ? `<a class="mcard live" href="#/mecz"><div class="mcard-date"><span class="live-dot"></span> Trwa mecz</div>
     <div class="mcard-score"><span class="t-A">${esc(live.teams.A)}</span><b>${score(live).A}:${score(live).B}</b><span class="t-B">${esc(live.teams.B)}</span></div></a>` : ''}
  ${othersLive().map((m) => `<a class="mcard live" href="#/mecz/${m.id}"><div class="mcard-date"><span class="live-dot"></span> Na żywo · ${minute(elapsed(m))}</div>
     <div class="mcard-score"><span class="t-A">${esc(m.teams.A)}</span><b>${score(m).A}:${score(m).B}</b><span class="t-B">${esc(m.teams.B)}</span></div></a>`).join('')}
  ${list.length ? list.map(card).join('') : empty('Brak zapisanych meczów w tym sezonie.', '<a class="btn primary" href="#/mecz">Zagraj mecz</a>')}`;
}

/* ---------- Statystyki sezonu ---------- */
function seasonStats(season) {
  const ms = seasonMatches(season).sort((a, b) => a.startedAt - b.startedAt);
  const rows = {};
  const R = (pid) => (rows[pid] ??= { pid, played: 0, w: 0, d: 0, l: 0, goals: 0, own: 0, pts: 0, form: [], hat: 0 });
  const rec = { win: null, goals: null, player: null };
  let goals = 0, hats = 0;
  for (const m of ms) {
    const S = summarize(m);
    goals += S.total;
    const diff = Math.abs(S.s.A - S.s.B);
    if (S.winner && (!rec.win || diff > rec.win.v)) rec.win = { v: diff, m };
    if (S.total && (!rec.goals || S.total > rec.goals.v)) rec.goals = { v: S.total, m };
    for (const p of S.players) {
      if (!p.team) continue;
      const r = R(p.pid);
      const res = !S.winner ? 'd' : S.winner === p.team ? 'w' : 'l';
      r.played++; r[res]++; r.pts += res === 'w' ? 3 : res === 'd' ? 1 : 0;
      r.goals += p.total; r.own += p.own; r.form.push(res);
      if (p.total >= 3) { r.hat++; hats++; }
      if (p.total && (!rec.player || p.total > rec.player.v)) rec.player = { v: p.total, pid: p.pid, m };
    }
  }
  const list = Object.values(rows).map((r) => ({ ...r, avg: r.played ? r.goals / r.played : 0, pct: r.played ? r.w / r.played : 0 }));
  return { ms, list, goals, hats, rec };
}

function viewStats() {
  const st = seasonStats(viewSeason);
  if (!st.ms.length) return seasonPicker() + empty('Brak meczów do policzenia statystyk.', '<a class="btn primary" href="#/mecz">Zagraj mecz</a>');

  const sorters = {
    pts: (a, b) => b.pts - a.pts || b.goals - a.goals,
    goals: (a, b) => b.goals - a.goals || b.avg - a.avg,
    avg: (a, b) => b.avg - a.avg || b.goals - a.goals,
    played: (a, b) => b.played - a.played || b.pts - a.pts,
    w: (a, b) => b.w - a.w || b.pct - a.pct,
    d: (a, b) => b.d - a.d,
    l: (a, b) => b.l - a.l,
  };
  const list = [...st.list].sort((a, b) => sorters[statsSort](a, b) || pname(a.pid).localeCompare(pname(b.pid), 'pl'));
  const th = (key, label) => `<th class="${statsSort === key ? 'sorted' : ''}" data-action="sort" data-key="${key}">${label}</th>`;

  const best = (fn) => { const top = [...st.list].sort(fn)[0]; return top; };
  const topScorer = best(sorters.goals);
  const topWins = best(sorters.w);
  const minGames = Math.max(1, Math.ceil(st.ms.length / 3));
  const eff = st.list.filter((r) => r.played >= minGames && r.goals).sort(sorters.avg)[0];

  const leaders = [];
  if (topScorer?.goals) leaders.push(['👑', 'Król strzelców', esc(pname(topScorer.pid)), goalsWord(topScorer.goals)]);
  if (topWins?.w) leaders.push(['🏆', 'Najwięcej zwycięstw', esc(pname(topWins.pid)), `${topWins.w} z ${topWins.played}`]);
  if (eff) leaders.push(['🎯', 'Najskuteczniejszy', esc(pname(eff.pid)), `${eff.avg.toFixed(2)} gola/mecz`]);

  const recs = [];
  const mlink = (m) => `<a href="#/mecz/${m.id}">${esc(m.teams.A)} ${score(m).A}:${score(m).B} ${esc(m.teams.B)}</a>`;
  if (st.rec.win) recs.push(['Najwyższe zwycięstwo', mlink(st.rec.win.m)]);
  if (st.rec.goals) recs.push(['Najwięcej goli w meczu', `${st.rec.goals.v} – ${mlink(st.rec.goals.m)}`]);
  if (st.rec.player) recs.push(['Rekord zawodnika w meczu', `${esc(pname(st.rec.player.pid))} – ${goalsWord(st.rec.player.v)}`]);
  if (st.hats) recs.push(['Hat-tricki', String(st.hats)]);

  return `
  ${seasonPicker()}
  <section class="tiles">
    <div class="tile"><b>${st.ms.length}</b><span>${plural(st.ms.length, 'mecz', 'mecze', 'meczów')}</span></div>
    <div class="tile"><b>${st.goals}</b><span>${plural(st.goals, 'gol', 'gole', 'goli')}</span></div>
    <div class="tile"><b>${(st.goals / st.ms.length).toFixed(1)}</b><span>goli / mecz</span></div>
  </section>

  ${leaders.length ? `<section class="leaders">${leaders.map(([i, l, n, v]) => `<div class="leader"><div class="leader-icon">${i}</div><div class="leader-label">${l}</div><div class="leader-name">${n}</div><div class="leader-val">${v}</div></div>`).join('')}</section>` : ''}

  <section class="card">
    <h2 class="card-title">Tabela</h2>
    <div class="table-wrap">
    <table class="table stats">
      <thead><tr><th>#</th><th class="l">Zawodnik</th>${th('played', 'M')}${th('w', 'W')}${th('d', 'R')}${th('l', 'P')}${th('goals', '⚽')}${th('avg', 'Śr')}${th('pts', 'Pkt')}</tr></thead>
      <tbody>${list.map((r, i) => `<tr data-action="player-detail" data-pid="${r.pid}">
        <td class="muted">${i + 1}</td>
        <td class="l"><div class="pcell">${esc(pname(r.pid))}</div><div class="form">${r.form.slice(-5).map((f) => `<i class="res res-${f === 'd' ? 'r' : f}"></i>`).join('')}</div></td>
        <td>${r.played}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
        <td><b>${r.goals}</b></td><td>${r.avg.toFixed(1)}</td><td><b>${r.pts}</b></td></tr>`).join('')}
      </tbody>
    </table>
    </div>
    <p class="muted small">M – mecze, W/R/P – wygrane/remisy/porażki, Śr – gole na mecz, Pkt – 3 za wygraną, 1 za remis. Wynik liczy się dla drużyny, w której zawodnik kończył mecz. Dotknij nagłówka, żeby sortować.</p>
  </section>

  ${recs.length ? `<section class="card">
    <h2 class="card-title">Rekordy</h2>
    <dl class="records">${recs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
  </section>` : ''}`;
}

function showPlayerDetail(pid) {
  const ms = seasonMatches(viewSeason).sort((a, b) => b.startedAt - a.startedAt);
  const rows = [];
  let g = 0, w = 0, d = 0, l = 0;
  for (const m of ms) {
    const S = summarize(m);
    const p = S.players.find((x) => x.pid === pid);
    if (!p || !p.team) continue;
    const res = !S.winner ? 'r' : S.winner === p.team ? 'w' : 'l';
    res === 'w' ? w++ : res === 'l' ? l++ : d++;
    g += p.total;
    rows.push(`<a class="drow" href="#/mecz/${m.id}">
      <i class="res res-${res}"></i>
      <span class="drow-date">${fmtDate(m.startedAt, { day: 'numeric', month: 'short' })}</span>
      <span class="drow-score">${esc(m.teams.A)} ${S.s.A}:${S.s.B} ${esc(m.teams.B)}</span>
      <span class="drow-g">${p.total ? '⚽' + p.total : ''}${p.switched ? ' ⇄' : ''}</span></a>`);
  }
  const close = openSheet(`
    <h3>${esc(pname(pid))}</h3>
    <p class="muted">${viewSeason === 'all' ? 'Wszystkie sezony' : 'Sezon ' + esc(viewSeason)}</p>
    <div class="tiles small-tiles">
      <div class="tile"><b>${rows.length}</b><span>mecze</span></div>
      <div class="tile"><b>${g}</b><span>gole</span></div>
      <div class="tile"><b>${w}-${d}-${l}</b><span>W-R-P</span></div>
    </div>
    <div class="drows">${rows.join('') || '<p class="muted">Brak meczów.</p>'}</div>`,
    (panel, close) => panel.addEventListener('click', (ev) => { if (ev.target.closest('a')) close(); }));
  return close;
}

/* ---------- Więcej: sezony, zawodnicy, dane ---------- */
function viewMore() {
  const apps = appearances();
  const players = [...db.players].sort(byName);
  const dbStatus = !Store.remote ? '📱 Tylko to urządzenie – wspólna baza nie jest podłączona.'
    : { ok: '🟢 Połączono ze wspólną bazą', syncing: '🔄 Synchronizacja…', offline: '🟠 Brak połączenia z bazą – zmiany zapisują się na telefonie i wyślą się później', local: '…' }[Store.status]
      + (Store.lastSync ? ` <span class="muted">(${new Date(Store.lastSync).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })})</span>` : '');
  return `
  <section class="card">
    <h2 class="card-title">Ty</h2>
    <label class="switch-row">
      <span><b>Tryb organizatora</b><br><span class="muted small">Planowanie meczów, ręczne dopisywanie zawodników i układanie składów.</span></span>
      <input type="checkbox" class="switch" data-change="organizer" ${isOrganizer() ? 'checked' : ''}>
    </label>
    <div class="switch-row">
      <span><b>Kim jestem</b><br><span class="muted small">${me() ? esc(pname(me())) : 'nie wybrano – ustawi się przy pierwszym zapisie'}</span></span>
      ${me() ? '<button type="button" class="link" data-action="forget-me">Zmień</button>' : ''}
    </div>
  </section>

  <section class="card">
    <h2 class="card-title">Sezon</h2>
    <p class="muted small">Nowe mecze zapisują się do bieżącego sezonu.</p>
    <div class="inline-form">
      <select data-change="season" aria-label="Bieżący sezon">${allSeasons().map((s) => `<option ${s === db.season ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <button type="button" class="btn" data-action="new-season">+ Nowy sezon</button>
    </div>
  </section>

  <section class="card">
    <h2 class="card-title">Zawodnicy <span class="muted">(${players.length})</span></h2>
    <form class="inline-form" data-form="roster-add">
      <input name="v" placeholder="Imię zawodnika" maxlength="40" autocomplete="off">
      <button class="btn">Dodaj</button>
    </form>
    <ul class="roster">${players.map((p) => `<li>
      <span>${esc(p.name)} <span class="muted small">${apps[p.id] ? `· ${apps[p.id]} ${plural(apps[p.id], 'mecz', 'mecze', 'meczów')}` : ''}</span></span>
      <span><button type="button" class="icon-btn" data-action="rename-player" data-pid="${p.id}" aria-label="Zmień imię">✎</button>
      <button type="button" class="icon-btn" data-action="delete-player" data-pid="${p.id}" aria-label="Usuń">🗑</button></span>
    </li>`).join('')}</ul>
    <p class="muted small">Literówka w imieniu? Zmień imię na już istniejące, a zawodnicy zostaną połączeni razem ze statystykami.</p>
  </section>

  <section class="card">
    <h2 class="card-title">Dane</h2>
    <p class="small">${dbStatus}</p>
    <p class="muted small">${Store.remote ? 'Statystyki i zapisy są wspólne dla wszystkich. Kopia na tym telefonie pozwala działać bez internetu.' : 'Zrób kopię, żeby przenieść dane na inny telefon albo nie stracić ich przy czyszczeniu przeglądarki.'}</p>
    <div class="btn-row">
      <button type="button" class="btn" data-action="export">⬇ Eksportuj</button>
      <button type="button" class="btn" data-action="import">⬆ Importuj</button>
    </div>
    <input type="file" id="import-file" accept="application/json,.json" data-change="import" hidden>
    ${Store.remote ? '' : '<button type="button" class="btn ghost danger-text block" data-action="wipe">Usuń wszystkie dane</button>'}
  </section>

  <section class="card">
    <h2 class="card-title">Wskazówka</h2>
    <p class="muted small">Dodaj stronę do ekranu głównego (w menu przeglądarki „Dodaj do ekranu głównego”), żeby działała jak aplikacja – także bez internetu. Podczas meczu ekran nie będzie się wygaszał.</p>
  </section>`;
}

/* =========================================================
   AKCJE
   ========================================================= */

/* Zmiana w trwającym meczu z możliwością cofnięcia */
function liveChange(m, label, mutate) {
  const snap = JSON.stringify({ e: m.events, l: m.lineup });
  if (mutate() === false) return;
  save(); buzz(); render();
  toast(typeof label === 'function' ? label() : label, () => {
    if (m.status !== 'live') return;
    const x = JSON.parse(snap);
    m.events = x.e; m.lineup = x.l;
    save(); render();
  });
}
function pushSwitch(m, pid, to) {
  const from = m.lineup[pid];
  m.lineup[pid] = to;
  m.events.push({ id: uid(), type: 'switch', pid, from, to, t: elapsed(m) });
}
/* Gol zawodnika. forceTeam – drużyna wskazana przyciskiem (dopisuje zawodnika
   do meczu albo przenosi go, jeśli w międzyczasie zmienił drużynę). */
function goal(m, pid, own = false, forceTeam = null) {
  const wasIn = pid in m.lineup;
  const moved = wasIn && forceTeam && m.lineup[pid] !== forceTeam;
  const ev = { id: uid(), type: 'goal', pid, team: null, own, t: elapsed(m) };
  liveChange(m, () => {
    const s = score(m);
    return `${own ? '🙈 Samobój' : '⚽ Gol'}: ${pname(pid)}${moved ? ` (teraz gra w: ${m.teams[forceTeam]})` : ''} · ${s.A}:${s.B}`;
  }, () => {
    if (!wasIn) m.lineup[pid] = forceTeam;
    else if (moved) pushSwitch(m, pid, forceTeam);
    ev.team = m.lineup[pid];
    m.events.push(ev);
  });
  const el = $(`#score-${beneficiary(ev)}`);
  if (el) el.classList.add('bump');
}

const actions = {
  /* --- przygotowanie meczu --- */
  cycle({ pid }) {
    const d = getDraft();
    const t = d.lineup[pid];
    if (!t) d.lineup[pid] = 'A';
    else if (t === 'A') d.lineup[pid] = 'B';
    else delete d.lineup[pid];
    save(); render();
  },
  shuffle() {
    const d = getDraft();
    const ids = Object.keys(d.lineup);
    if (ids.length < 2) return toast('Najpierw dodaj zawodników do drużyn');
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const first = Math.random() < 0.5 ? 'A' : 'B';
    ids.forEach((id, i) => { d.lineup[id] = i % 2 === 0 ? first : other(first); });
    save(); render(); toast('🎲 Składy wylosowane');
  },
  'last-lineup'() {
    const last = db.matches.filter((m) => m.status === 'done').sort((a, b) => b.startedAt - a.startedAt)[0];
    if (!last) return toast('Brak poprzedniego meczu');
    const d = getDraft();
    d.A = last.teams.A; d.B = last.teams.B;
    d.lineup = {};
    for (const [pid, t] of Object.entries(last.lineup)) if (playerById(pid)) d.lineup[pid] = t;
    save(); render(); toast('↺ Składy z ostatniego meczu');
  },
  start() {
    const d = getDraft();
    const A = norm(d.A) || 'Drużyna A';
    let B = norm(d.B) || 'Drużyna B';
    if (same(A, B)) B += ' 2';
    const now = Date.now();
    const lineup = {};
    for (const [pid, t] of Object.entries(d.lineup)) if (playerById(pid)) lineup[pid] = t;
    const m = { id: uid(), season: db.season, startedAt: now, endedAt: null, pausedAt: null, pausedMs: 0, status: 'live', teams: { A, B }, lineup, events: [] };
    db.matches.push(m);
    db.activeId = m.id;
    db.lastTeams = { A, B };
    db.draft = { A, B, lineup: { ...lineup } };
    save();
    if (location.hash !== '#/mecz') location.hash = '#/mecz'; else render();
    window.scrollTo(0, 0);
  },

  /* --- mecz na żywo --- */
  goal({ pid }) { const m = activeMatch(); if (m) goal(m, pid); },
  'quick-goal'({ team }) {
    const m = activeMatch();
    const input = $('#quick-name');
    const name = norm(input.value);
    if (!name) { toast('Wpisz imię strzelca'); input.focus(); return; }
    const p = ensurePlayer(name);
    goal(m, p.id, false, team);
  },
  'player-menu': async ({ pid }) => {
    const m = activeMatch();
    const t = m.lineup[pid];
    const { g, o } = playerGoals(m, pid);
    const opts = [
      { label: '⚽ Gol', value: 'goal', cls: 'primary' },
      { label: `🙈 Samobój (gol dla: ${m.teams[other(t)]})`, value: 'own' },
      { label: `⇄ Przenieś do: ${m.teams[other(t)]}`, value: 'switch' },
    ];
    if (!g && !o) opts.push({ label: 'Usuń z meczu', value: 'remove', cls: 'ghost danger-text' });
    const a = await choose(pname(pid), `${m.teams[t]} · ${goalsWord(g)}${o ? ` · samobóje: ${o}` : ''}`, opts);
    if (a === 'goal') goal(m, pid);
    else if (a === 'own') goal(m, pid, true);
    else if (a === 'switch') liveChange(m, `⇄ ${pname(pid)} gra teraz w: ${m.teams[other(t)]}`, () => pushSwitch(m, pid, other(t)));
    else if (a === 'remove') liveChange(m, `${pname(pid)} usunięty z meczu`, () => {
      delete m.lineup[pid];
      m.events = m.events.filter((e) => e.pid !== pid);
    });
  },
  'add-to-team'({ team }) {
    const m = activeMatch();
    const avail = db.players.filter((p) => !(p.id in m.lineup)).sort(byName);
    openSheet(`
      <h3>Dodaj do: ${esc(m.teams[team])}</h3>
      <form class="inline-form">
        <input name="v" placeholder="Imię zawodnika" maxlength="40" autocomplete="off" enterkeyhint="done">
        <button class="btn primary">Dodaj</button>
      </form>
      ${avail.length ? `<p class="muted small">Albo wybierz z listy (możesz kilku):</p><div class="chips">${avail.map((p) => `<button type="button" class="chip" data-pick="${p.id}">${esc(p.name)}</button>`).join('')}</div>` : ''}`,
      (panel, close) => {
        const add = (p) => {
          if (!(p.id in m.lineup)) m.lineup[p.id] = team;
          else if (m.lineup[p.id] !== team) pushSwitch(m, p.id, team);
          save(); render();
        };
        const f = panel.querySelector('form');
        setTimeout(() => f.v.focus(), 80);
        f.onsubmit = (ev) => {
          ev.preventDefault();
          const p = ensurePlayer(f.v.value);
          if (!p) return;
          const moved = m.lineup[p.id] && m.lineup[p.id] !== team;
          add(p); close();
          toast(moved ? `⇄ ${p.name} gra teraz w: ${m.teams[team]}` : `${p.name} dołączył do: ${m.teams[team]}`);
        };
        panel.querySelectorAll('[data-pick]').forEach((b) => {
          b.onclick = () => { add(playerById(b.dataset.pick)); b.remove(); };
        });
      });
  },
  pause() {
    const m = activeMatch();
    if (m.pausedAt) { m.pausedMs += Date.now() - m.pausedAt; m.pausedAt = null; }
    else m.pausedAt = Date.now();
    save(); render();
  },
  async 'rename-team'({ team }) {
    const m = activeMatch();
    const v = await askText('Nazwa drużyny', m.teams[team]);
    if (!v) return;
    m.teams[team] = v;
    db.lastTeams[team] = v;
    save(); render();
  },
  'del-event'({ id }) {
    const m = activeMatch();
    const e = m.events.find((x) => x.id === id);
    if (!e) return;
    liveChange(m, e.type === 'goal' ? `Usunięto gola: ${pname(e.pid)}` : `Cofnięto zmianę drużyny: ${pname(e.pid)}`, () => {
      if (e.type === 'switch' && m.lineup[e.pid] === e.to) m.lineup[e.pid] = e.from;
      m.events = m.events.filter((x) => x.id !== id);
    });
  },
  undo() {
    const m = activeMatch();
    const e = m.events[m.events.length - 1];
    if (e) actions['del-event']({ id: e.id });
  },
  async finish() {
    const m = activeMatch();
    const s = score(m);
    const empty = !m.events.length;
    const opts = [{ label: '🏁 Zakończ i zapisz', value: 'save', cls: 'primary' }];
    if (empty) opts.push({ label: 'Odrzuć mecz (nie zapisuj)', value: 'discard', cls: 'ghost danger-text' });
    const a = await choose('Zakończyć mecz?', `${m.teams.A} ${s.A} : ${s.B} ${m.teams.B}`, opts);
    if (!a) return;
    db.activeId = null;
    if (a === 'discard') {
      db.matches = db.matches.filter((x) => x.id !== m.id);
      save(); render(); return;
    }
    const now = Date.now();
    if (m.pausedAt) { m.pausedMs += now - m.pausedAt; m.pausedAt = null; }
    m.endedAt = now;
    m.status = 'done';
    if (!db.seasons.includes(m.season)) db.seasons.push(m.season);
    save();
    justFinished = m.id;
    location.hash = `#/mecz/${m.id}`;
    window.scrollTo(0, 0);
  },

  /* --- podsumowanie --- */
  share({ id }) { shareOrCopy(shareText(matchById(id))); },
  async reopen({ id }) {
    if (activeMatch()) return toast('Najpierw zakończ trwający mecz');
    if (!(await confirmBox('Wznowić mecz?', 'Mecz wróci do trybu na żywo – możesz dopisać gole i zakończyć go ponownie.', '↺ Wznów', 'primary'))) return;
    const m = matchById(id);
    m.status = 'live';
    m.pausedAt = m.endedAt; // czas stoi, dopóki nie wznowisz zegara
    m.endedAt = null;
    db.activeId = m.id;
    save();
    location.hash = '#/mecz';
  },
  async 'delete-match'({ id }) {
    if (!(await confirmBox('Usunąć mecz?', 'Tej operacji nie da się cofnąć.', '🗑 Usuń'))) return;
    db.matches = db.matches.filter((m) => m.id !== id);
    if (db.activeId === id) db.activeId = null;
    save();
    location.hash = '#/historia';
    toast('Mecz usunięty');
  },

  /* --- historia i statystyki --- */
  'view-season'({ season }) { viewSeason = season; render(); },
  sort({ key }) { statsSort = key; render(); },
  'player-detail'({ pid }) { showPlayerDetail(pid); },

  /* --- więcej --- */
  async 'new-season'() {
    const v = await askText('Nazwa nowego sezonu', '', 'np. 2027 albo Wiosna 2027');
    if (!v) return;
    if (!db.seasons.includes(v)) db.seasons.push(v);
    db.season = v; viewSeason = v;
    // (sezon z meczów innych osób też trafia na listę)
    save(); render(); toast(`Bieżący sezon: ${v}`);
  },
  async 'rename-player'({ pid }) {
    const p = playerById(pid);
    const v = await askText('Zmień imię', p.name);
    if (!v || v === p.name) return;
    const dup = db.players.find((x) => x.id !== pid && same(x.name, v));
    if (!dup) { p.name = v; save(); render(); return; }
    if (!(await confirmBox(`Połączyć z „${dup.name}”?`, `Zawodnik „${dup.name}” już istnieje. Mecze i gole „${p.name}” zostaną przepisane na „${dup.name}”.`, 'Połącz', 'primary'))) return;
    mergePlayers(pid, dup.id);
    save(); render(); toast(`Połączono z: ${dup.name}`);
  },
  async 'delete-player'({ pid }) {
    const p = playerById(pid);
    const used = db.matches.some((m) => pid in m.lineup || m.events.some((e) => e.pid === pid));
    if (used) return toast(`${p.name} ma zapisane mecze – nie można usunąć`);
    if (db.signups.some((s) => s.pid === pid)) return toast(`${p.name} jest zapisany na mecz – najpierw usuń zgłoszenie`);
    if (!(await confirmBox(`Usunąć ${p.name}?`, '', '🗑 Usuń'))) return;
    db.players = db.players.filter((x) => x.id !== pid);
    if (db.draft) delete db.draft.lineup[pid];
    if (db.me === pid) db.me = null;
    save(); render();
  },
  export() {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `scoreboard-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('⬇ Zapisano plik kopii');
  },
  import() { $('#import-file').click(); },
  async wipe() {
    if (!(await confirmBox('Usunąć wszystkie dane?', 'Zawodnicy, mecze i statystyki zostaną skasowane. Najpierw zrób eksport, jeśli chcesz je zachować.', 'Usuń wszystko'))) return;
    db = freshDb(); viewSeason = db.season;
    save(); render(); toast('Dane usunięte');
  },
};

/* Ten sam zawodnik dodany na dwóch telefonach (różne id, to samo imię).
   Wszystkie telefony wybierają to samo id (najmniejsze), więc dane się zbiegają. */
function dedupePlayers() {
  const groups = {};
  for (const p of db.players) (groups[norm(p.name).toLocaleLowerCase('pl')] ??= []).push(p);
  let merged = false;
  for (const list of Object.values(groups)) {
    if (list.length < 2) continue;
    const [keep, ...rest] = [...list].sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const p of rest) { mergePlayers(p.id, keep.id); merged = true; }
  }
  if (merged) save();
}

function mergePlayers(fromId, toId) {
  const remap = (m) => {
    if (fromId in m.lineup) {
      if (!(toId in m.lineup)) m.lineup[toId] = m.lineup[fromId];
      delete m.lineup[fromId];
    }
    for (const e of m.events) if (e.pid === fromId) e.pid = toId;
  };
  db.matches.forEach(remap);
  if (db.draft) remap({ lineup: db.draft.lineup, events: [] });
  for (const g of db.games) if (g.teams?.lineup) remap({ lineup: g.teams.lineup, events: [] });
  for (const sg of db.signups.filter((x) => x.pid === fromId)) {
    const id = `${sg.gameId}:${toId}`;
    if (db.signups.some((x) => x.id === id)) db.signups = db.signups.filter((x) => x !== sg);
    else { sg.id = id; sg.pid = toId; }
  }
  if (db.me === fromId) db.me = toId;
  db.players = db.players.filter((p) => p.id !== fromId);
}

function importData(inc, mode) {
  if (mode === 'replace') {
    db = { ...freshDb(), ...inc, activeId: null, draft: null, me: db.me, settings: db.settings };
    db.matches = db.matches.filter((m) => m.status === 'done');
    viewSeason = db.season;
    return db.matches.length;
  }
  const idMap = {};
  for (const p of inc.players || []) {
    if (playerById(p.id)) { idMap[p.id] = p.id; continue; }
    const existing = findPlayer(p.name);
    if (existing) idMap[p.id] = existing.id;
    else { db.players.push({ id: p.id, name: p.name }); idMap[p.id] = p.id; }
  }
  let added = 0;
  for (const m of inc.matches || []) {
    if (m.status !== 'done' || matchById(m.id)) continue;
    const lineup = {};
    for (const [k, v] of Object.entries(m.lineup || {})) lineup[idMap[k] ?? k] = v;
    db.matches.push({ ...m, lineup, events: (m.events || []).map((e) => ({ ...e, pid: idMap[e.pid] ?? e.pid })) });
    if (!db.seasons.includes(m.season)) db.seasons.push(m.season);
    added++;
  }
  for (const g of inc.games || []) if (!gameById(g.id)) db.games.push(g);
  for (const sg of inc.signups || []) {
    const pid = idMap[sg.pid] ?? sg.pid;
    const id = `${sg.gameId}:${pid}`;
    if (!db.signups.some((x) => x.id === id)) db.signups.push({ ...sg, id, pid });
  }
  return added;
}

Object.assign(actions, gameActions);

/* ---------- Formularze i zdarzenia ---------- */
const forms = {
  'signup-self'(f) {
    const g = gameById(f.dataset.gid);
    const p = ensurePlayer(f.v.value);
    if (!g || !p) return;
    db.me = p.id;
    setSignup(g, p.id, 'in', 'self');
    buzz(); render();
    toast(viaLinks(g) ? 'Zapisano – teraz wyślij odpowiedź organizatorowi 📨' : `✅ ${p.name}, jesteś zapisany!`);
  },
  'setup-add'(f) {
    const p = ensurePlayer(f.v.value);
    if (!p) return;
    const d = getDraft();
    if (!d.lineup[p.id]) {
      const c = { A: 0, B: 0 };
      Object.values(d.lineup).forEach((t) => c[t]++);
      d.lineup[p.id] = c.A <= c.B ? 'A' : 'B';
    }
    save(); render();
    $('[data-form="setup-add"] input')?.focus();
  },
  quick(f) {
    const m = activeMatch();
    const name = norm(f.v.value);
    if (!name) return;
    const p = findPlayer(name);
    if (p && p.id in m.lineup) goal(m, p.id);
    else toast('Wybierz drużynę – przycisk ⚽ poniżej');
  },
  'roster-add'(f) {
    const name = norm(f.v.value);
    if (!name) return;
    if (findPlayer(name)) return toast('Taki zawodnik już jest');
    ensurePlayer(name);
    save(); render();
    $('[data-form="roster-add"] input')?.focus();
  },
};

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  ev.preventDefault();
  fn({ ...el.dataset }, el);
});
document.addEventListener('keydown', (ev) => {
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches?.('.prow')) { ev.preventDefault(); ev.target.click(); }
});
document.addEventListener('submit', (ev) => {
  const f = ev.target;
  const fn = forms[f.dataset.form];
  if (!fn) return;
  ev.preventDefault();
  fn(f);
});
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.dataset.bind) { getDraft()[t.dataset.bind] = t.value; save(); }
});
document.addEventListener('change', async (ev) => {
  const t = ev.target;
  if (t.dataset.change === 'organizer') {
    db.settings = { ...db.settings, organizer: t.checked };
    save(); toast(t.checked ? 'Tryb organizatora włączony' : 'Tryb organizatora wyłączony');
  } else if (t.dataset.change === 'season') {
    db.season = t.value; viewSeason = t.value;
    save(); render(); toast(`Bieżący sezon: ${t.value}`);
  } else if (t.dataset.change === 'import') {
    const file = t.files[0];
    t.value = '';
    if (!file) return;
    let inc;
    try {
      inc = JSON.parse(await file.text());
      if (!Array.isArray(inc.players) || !Array.isArray(inc.matches)) throw new Error();
    } catch (e) { return toast('⚠️ To nie jest plik kopii Scoreboard'); }
    const mode = await choose('Import danych', `W pliku: ${inc.matches.length} meczów, ${inc.players.length} zawodników.`, [
      { label: 'Połącz z obecnymi danymi', value: 'merge', cls: 'primary' },
      ...(Store.remote ? [] : [{ label: 'Zastąp obecne dane', value: 'replace', cls: 'ghost danger-text' }]),
    ]);
    if (!mode) return;
    const n = importData(inc, mode);
    save(); render(); toast(`⬆ Zaimportowano ${n} ${plural(n, 'mecz', 'mecze', 'meczów')}`);
  }
});
window.addEventListener('hashchange', () => {
  // „Cofnij” z poprzedniego ekranu nie może zmieniać meczu po wyjściu z niego
  $('#toast').classList.remove('show');
  $('#confetti').innerHTML = '';
  render();
  window.scrollTo(0, 0);
});

/* ---------- Zegar ---------- */
setInterval(() => {
  const el = $('#timer');
  const m = activeMatch();
  if (el && m) el.textContent = fmtClock(elapsed(m));
}, 1000);

/* ---------- Konfetti po meczu ---------- */
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const root = $('#confetti');
  const colors = ['#22c55e', '#38bdf8', '#f97316', '#facc15', '#f472b6', '#ffffff'];
  let html = '';
  for (let i = 0; i < 90; i++) {
    html += `<i style="left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${(Math.random() * 0.7).toFixed(2)}s;animation-duration:${(2.2 + Math.random() * 1.6).toFixed(2)}s;width:${6 + Math.random() * 6}px"></i>`;
  }
  root.innerHTML = html;
  setTimeout(() => { root.innerHTML = ''; }, 4500);
}

/* ---------- Start ---------- */
render();

/* Zmiany od innych użytkowników (gdy podpięta jest baza) */
let renderPending = false;
const busy = () => document.activeElement?.matches?.('input, textarea, select') || $('#sheet').classList.contains('open');
Store.onChange((ev) => {
  if (ev.type === 'data') { db = ev.db; dedupePlayers(); }
  else if (route().view !== 'wiecej') return; // status synchronizacji widać tylko w „Więcej”
  if (busy()) { renderPending = true; return; }
  render();
});
document.addEventListener('focusout', () => setTimeout(() => { if (renderPending && !busy()) { renderPending = false; render(); } }, 300));
Store.init();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
