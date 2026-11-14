import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { signupStatus, team } from "./schema";
import { findOrCreatePlayer, requireAdmin } from "./lib";

const gameInput = {
  date: v.string(),
  time: v.string(),
  place: v.string(),
  limit: v.number(),
  note: v.string(),
};
const clip = (s: string, n: number) => s.trim().slice(0, n);

/* Zaplanowane (otwarte) terminy + kilka ostatnich rozegranych */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const open = await ctx.db.query("games").withIndex("by_status_date", (q) => q.eq("status", "open")).collect();
    const counts = await Promise.all(
      open.map(async (g) => {
        const s = await ctx.db.query("signups").withIndex("by_game", (q) => q.eq("gameId", g._id)).collect();
        return { in: s.filter((x) => x.status === "in").length, maybe: s.filter((x) => x.status === "maybe").length };
      }),
    );
    return open.map((g, i) => ({ ...g, counts: counts[i] }));
  },
});

/* Termin ze zgłoszeniami – strona zapisów (publiczna) */
export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const gid = ctx.db.normalizeId("games", id);
    const g = gid ? await ctx.db.get(gid) : null;
    if (!g) return null;
    const signups = await ctx.db.query("signups").withIndex("by_game", (q) => q.eq("gameId", g._id)).collect();
    signups.sort((a, b) => a.at - b.at);
    return { ...g, signups };
  },
});

export const create = mutation({
  args: { token: v.string(), ...gameInput },
  handler: async (ctx, { token, ...g }) => {
    await requireAdmin(ctx, token);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(g.date)) throw new Error("Podaj datę meczu.");
    return await ctx.db.insert("games", {
      date: g.date,
      time: clip(g.time, 5),
      place: clip(g.place, 60),
      limit: Math.max(0, Math.min(60, Math.round(g.limit) || 0)),
      note: clip(g.note, 160),
      status: "open",
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: { token: v.string(), id: v.id("games"), ...gameInput },
  handler: async (ctx, { token, id, ...g }) => {
    await requireAdmin(ctx, token);
    await ctx.db.patch(id, {
      date: g.date,
      time: clip(g.time, 5),
      place: clip(g.place, 60),
      limit: Math.max(0, Math.min(60, Math.round(g.limit) || 0)),
      note: clip(g.note, 160),
    });
  },
});

/* Odwołanie terminu – znika z listy razem ze zgłoszeniami */
export const cancel = mutation({
  args: { token: v.string(), id: v.id("games") },
  handler: async (ctx, { token, id }) => {
    await requireAdmin(ctx, token);
    for (const s of await ctx.db.query("signups").withIndex("by_game", (q) => q.eq("gameId", id)).collect())
      await ctx.db.delete(s._id);
    await ctx.db.delete(id);
  },
});

/* Zapis zawodnika – publiczny, bez konta. Zwraca id zawodnika (telefon go zapamiętuje). */
export const signup = mutation({
  args: { gameId: v.id("games"), name: v.optional(v.string()), playerId: v.optional(v.id("players")), status: signupStatus },
  handler: async (ctx, { gameId, name, playerId, status }) => {
    const g = await ctx.db.get(gameId);
    if (!g || g.status !== "open") throw new Error("Zapisy na ten mecz są zamknięte.");
    const pid = playerId && (await ctx.db.get(playerId)) ? playerId : await findOrCreatePlayer(ctx, name ?? "");
    const s = await ctx.db.query("signups").withIndex("by_game_player", (q) => q.eq("gameId", gameId).eq("playerId", pid)).unique();
    if (s) {
      if (s.status !== status) await ctx.db.patch(s._id, { status, by: "self", at: Date.now() });
    } else await ctx.db.insert("signups", { gameId, playerId: pid, status, by: "self", at: Date.now() });
    return pid;
  },
});

/* Zmiana zgłoszenia przez administratora (dopisanie ręczne, zmiana statusu, usunięcie) */
export const adminSignup = mutation({
  args: {
    token: v.string(),
    gameId: v.id("games"),
    playerId: v.optional(v.id("players")),
    name: v.optional(v.string()),
    status: v.union(signupStatus, v.null()),
  },
  handler: async (ctx, { token, gameId, playerId, name, status }) => {
    await requireAdmin(ctx, token);
    const pid = playerId ?? (await findOrCreatePlayer(ctx, name ?? ""));
    const s = await ctx.db.query("signups").withIndex("by_game_player", (q) => q.eq("gameId", gameId).eq("playerId", pid)).unique();
    if (status === null) {
      if (s) await ctx.db.delete(s._id);
      const g = await ctx.db.get(gameId);
      if (g?.teams && pid in g.teams.lineup) {
        const lineup = { ...g.teams.lineup };
        delete lineup[pid];
        await ctx.db.patch(gameId, { teams: { ...g.teams, lineup } });
      }
    } else if (s) {
      if (s.status !== status) await ctx.db.patch(s._id, { status, by: "admin", at: Date.now() });
    } else await ctx.db.insert("signups", { gameId, playerId: pid, status, by: "admin", at: Date.now() });
    return pid;
  },
});

/* Składy ułożone przez administratora */
export const saveTeams = mutation({
  args: {
    token: v.string(),
    id: v.id("games"),
    teams: v.object({ A: v.string(), B: v.string(), lineup: v.record(v.string(), team), published: v.boolean() }),
  },
  handler: async (ctx, { token, id, teams }) => {
    await requireAdmin(ctx, token);
    await ctx.db.patch(id, { teams: { ...teams, A: clip(teams.A, 20) || "Drużyna A", B: clip(teams.B, 20) || "Drużyna B" } });
  },
});
