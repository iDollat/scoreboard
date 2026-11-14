/* Logika meczu i statystyk – wspólna dla wszystkich ekranów */
export type Team = 'A' | 'B';
export type MatchEvent = {
  id: string; type: 'goal' | 'switch'; pid: string; team?: Team; own?: boolean; from?: Team; to?: Team; t: number;
};
export type MatchLike = {
  season: string; status: 'live' | 'done'; startedAt: number; endedAt?: number; pausedAt?: number; pausedMs: number;
  teams: { A: string; B: string }; lineup: Record<string, Team>; events: MatchEvent[];
};

export const other = (t: Team): Team => (t === 'A' ? 'B' : 'A');
export const beneficiary = (e: MatchEvent): Team => (e.own ? other(e.team!) : e.team!);

export function elapsed(m: MatchLike) {
  const end = m.endedAt || m.pausedAt || Date.now();
  return Math.max(0, end - m.startedAt - (m.pausedMs || 0));
}
export function score(m: MatchLike) {
  const s = { A: 0, B: 0 };
  for (const e of m.events) if (e.type === 'goal') s[beneficiary(e)]++;
  return s;
}
export function playerGoals(m: MatchLike, pid: string) {
  let g = 0, o = 0;
  for (const e of m.events) if (e.type === 'goal' && e.pid === pid) (e.own ? o++ : g++);
  return { g, o };
}
export const switchedIn = (m: MatchLike, pid: string) => m.events.some((e) => e.type === 'switch' && e.pid === pid);

export type PlayerLine = { pid: string; goals: { A: number; B: number }; own: number; total: number; team: Team | null; switched: boolean };
export type TimelineItem = MatchEvent & { run: { A: number; B: number } };

export function summarize(m: MatchLike, nameOf: (id: string) => string = (x) => x) {
  const s = score(m);
  const winner: Team | null = s.A > s.B ? 'A' : s.B > s.A ? 'B' : null;
  const stats: Record<string, PlayerLine> = {};
  const P = (pid: string) => (stats[pid] ??= { pid, goals: { A: 0, B: 0 }, own: 0, total: 0, team: m.lineup[pid] ?? null, switched: false });
  Object.keys(m.lineup).forEach(P);
  const run = { A: 0, B: 0 };
  const maxLead = { A: 0, B: 0 };
  const timeline: TimelineItem[] = [];
  const scorers: Record<Team, { pid: string; n: number; own: boolean }[]> = { A: [], B: [] };
  let decisive: MatchEvent | null = null, firstGoal: MatchEvent | null = null;
  for (const e of m.events) {
    if (e.type === 'switch') { P(e.pid).switched = true; timeline.push({ ...e, run: { ...run } }); continue; }
    const p = P(e.pid);
    if (e.own) p.own++; else { p.goals[e.team!]++; p.total++; }
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
  const players = Object.values(stats).sort((a, b) => b.total - a.total || nameOf(a.pid).localeCompare(nameOf(b.pid), 'pl'));
  const topN = players[0]?.total || 0;
  return {
    s, winner, players, timeline, maxLead, decisive: decisive as MatchEvent | null, firstGoal: firstGoal as MatchEvent | null, scorers,
    total: s.A + s.B,
    top: topN ? players.filter((p) => p.total === topN) : [],
    comeback: winner ? maxLead[other(winner)] : 0,
    duration: elapsed(m),
  };
}

export type StatRow = {
  pid: string; played: number; w: number; d: number; l: number; goals: number; own: number; pts: number;
  form: ('w' | 'd' | 'l')[]; hat: number; avg: number; pct: number;
};

export function seasonStats<M extends MatchLike>(all: M[], season: string) {
  const ms = all.filter((m) => m.status === 'done' && (season === 'all' || m.season === season)).sort((a, b) => a.startedAt - b.startedAt);
  const rows: Record<string, StatRow> = {};
  const R = (pid: string) => (rows[pid] ??= { pid, played: 0, w: 0, d: 0, l: 0, goals: 0, own: 0, pts: 0, form: [], hat: 0, avg: 0, pct: 0 });
  const rec: { win: { v: number; m: M } | null; goals: { v: number; m: M } | null; player: { v: number; pid: string; m: M } | null } = { win: null, goals: null, player: null };
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

/* Siła zawodnika: punkty na mecz + pół gola na mecz, „ściągnięte” do średniej
   przy małej liczbie meczów (nowy zawodnik = przeciętny). */
export function ratingFn(all: MatchLike[]) {
  const { list } = seasonStats(all, 'all');
  const totG = list.reduce((a, r) => a + r.goals, 0);
  const totP = list.reduce((a, r) => a + r.played, 0);
  const avgG = totP ? totG / totP : 0.5;
  const K = 3;
  const map: Record<string, number> = {};
  for (const r of list) map[r.pid] = (r.pts + 1.5 * K) / (r.played + K) + 0.5 * (r.goals + avgG * K) / (r.played + K);
  const def = 1.5 + 0.5 * avgG;
  return (pid: string) => map[pid] ?? def;
}

/* Najbardziej wyrównany podział (pełne przeszukanie do 18 osób, wyżej – zachłannie) */
export function balanceTeams(pids: string[], rate: (pid: string) => number): Record<string, Team> {
  const ids = [...pids];
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const n = ids.length;
  const r = ids.map(rate);
  const total = r.reduce((a, b) => a + b, 0);
  const lineup: Record<string, Team> = {};
  if (n <= 18) {
    const sizes = new Set([Math.floor(n / 2), Math.ceil(n / 2)]);
    let best = Infinity;
    const cands: number[] = [];
    for (let mask = 0; mask < 1 << n; mask++) {
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
    const order = ids.map((id, i) => [id, r[i]] as const).sort((a, b) => b[1] - a[1]);
    const sum = { A: 0, B: 0 }, cnt = { A: 0, B: 0 }, max = Math.ceil(n / 2);
    for (const [id, v] of order) {
      const t: Team = cnt.A >= max ? 'B' : cnt.B >= max ? 'A' : sum.A <= sum.B ? 'A' : 'B';
      lineup[id] = t; sum[t] += v; cnt[t]++;
    }
  }
  return lineup;
}
