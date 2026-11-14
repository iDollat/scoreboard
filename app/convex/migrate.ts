import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { cleanName, isOldSeasonName, nameKey, seasonFor } from "./lib";

/*
 * Jednorazowe przeniesienie danych z poprzedniej wersji bazy (rekordy JSON z sync:pull).
 * Funkcja wewnętrzna – uruchamia się ją tylko z klucza wdrożeniowego:
 *   npx convex run migrate:importBackup '{"data": {...}}'
 * Przenosi zawodników, otwarte terminy (ze składami) i zgłoszenia. Ponowne uruchomienie niczego nie dubluje.
 */
const team = (t: unknown): "A" | "B" | undefined => (t === "A" || t === "B" ? t : undefined);

export const importBackup = internalMutation({
  args: { data: v.any() },
  handler: async (ctx, { data }) => {
    const players: Record<string, Id<"players">> = {};
    let np = 0, ng = 0, ns = 0;
    for (const p of data.players ?? []) {
      const name = cleanName(String(p?.name ?? ""));
      if (!p?.id || !name) continue;
      const found =
        (await ctx.db.query("players").withIndex("by_legacyId", (q) => q.eq("legacyId", p.id)).first()) ??
        (await ctx.db.query("players").withIndex("by_key", (q) => q.eq("key", nameKey(name))).first());
      if (found) players[p.id] = found._id;
      else { players[p.id] = await ctx.db.insert("players", { name, key: nameKey(name), legacyId: p.id }); np++; }
    }

    const games: Record<string, Id<"games">> = {};
    for (const g of data.games ?? []) {
      if (!g?.id || g.status !== "open") continue;
      const found = await ctx.db.query("games").withIndex("by_legacyId", (q) => q.eq("legacyId", g.id)).first();
      if (found) { games[g.id] = found._id; continue; }
      const lineup: Record<string, "A" | "B"> = {};
      for (const [pid, t] of Object.entries(g.teams?.lineup ?? {})) if (players[pid] && team(t)) lineup[players[pid]] = team(t)!;
      games[g.id] = await ctx.db.insert("games", {
        date: String(g.date), time: String(g.time ?? ""), place: String(g.place ?? "").slice(0, 60),
        limit: Number(g.limit) || 0, note: String(g.note ?? "").slice(0, 160), status: "open",
        createdAt: Number(g.createdAt) || Date.now(), legacyId: g.id,
        ...(g.teams ? { teams: { A: String(g.teams.A || "Biali"), B: String(g.teams.B || "Czarni"), lineup, published: !!g.teams.published } } : {}),
      });
      ng++;
    }

    for (const s of data.signups ?? []) {
      const gameId = games[s?.gameId], playerId = players[s?.pid];
      if (!gameId || !playerId || !["in", "maybe", "out"].includes(s.status)) continue;
      const dup = await ctx.db.query("signups").withIndex("by_game_player", (q) => q.eq("gameId", gameId).eq("playerId", playerId)).unique();
      if (dup) continue;
      await ctx.db.insert("signups", { gameId, playerId, status: s.status, by: s.by === "self" ? "self" : "admin", at: Number(s.at) || Date.now() });
      ns++;
    }
    return { players: np, games: ng, signups: ns };
  },
});

/* Zmiana nazw sezonów z samego roku ("2026") na sezony piłkarskie ("2026/2027").
   npx convex run migrate:seasonNames */
export const seasonNames = internalMutation({
  args: {},
  handler: async (ctx) => {
    let changed = 0;
    for (const m of await ctx.db.query("matches").collect()) {
      if (!isOldSeasonName(m.season)) continue;
      await ctx.db.patch(m._id, { season: seasonFor(m.startedAt) });
      changed++;
    }
    const st = await ctx.db.query("settings").first();
    if (st) {
      const fromMatches = (await ctx.db.query("matches").collect()).map((m) => m.season);
      const seasons = [...new Set([...st.seasons.filter((x) => !isOldSeasonName(x)), ...fromMatches, seasonFor()])];
      await ctx.db.patch(st._id, { seasons, season: st.season && !isOldSeasonName(st.season) ? st.season : undefined });
    }
    return { matches: changed, settings: !!st };
  },
});

/* Wymiana całej listy zawodników (np. na start sezonu).
   Odmawia, jeśli zawodnicy mają rozegrane mecze – historia by się rozsypała.
   npx convex run migrate:replacePlayers '{"names": ["Adam C.", ...]}' */
export const replacePlayers = internalMutation({
  args: { names: v.array(v.string()) },
  handler: async (ctx, { names }) => {
    if ((await ctx.db.query("matches").first()) !== null)
      throw new Error("W bazie są rozegrane mecze – nie usuwam zawodników (użyj zmiany imion / łączenia).");
    for (const s of await ctx.db.query("signups").collect()) await ctx.db.delete(s._id);
    for (const g of await ctx.db.query("games").collect())
      if (g.teams) await ctx.db.patch(g._id, { teams: { ...g.teams, lineup: {} } });
    const removed = (await ctx.db.query("players").collect()).length;
    for (const p of await ctx.db.query("players").collect()) await ctx.db.delete(p._id);
    const added: string[] = [];
    for (const raw of names) {
      const name = cleanName(raw);
      if (!name || added.some((a) => nameKey(a) === nameKey(name))) continue;
      await ctx.db.insert("players", { name, key: nameKey(name) });
      added.push(name);
    }
    return { removed, added };
  },
});
