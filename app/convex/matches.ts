import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { matchFields } from "./schema";
import { findOrCreatePlayer, requireAdmin } from "./lib";

/* Wszystkie mecze (zakończone i trwające) – statystyki liczy aplikacja */
export const list = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("matches").withIndex("by_startedAt").order("desc").collect(),
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const mid = ctx.db.normalizeId("matches", id);
    return mid ? await ctx.db.get(mid) : null;
  },
});

/* Zapis meczu z telefonu administratora (także trwającego – na żywo).
   Zawodnicy dopisani w trakcie meczu bez internetu mają tymczasowe id "new:Imię"
   – serwer zamienia je na prawdziwe i zwraca mapowanie. */
export const save = mutation({
  args: { token: v.string(), match: v.object(matchFields) },
  handler: async (ctx, { token, match }) => {
    await requireAdmin(ctx, token);
    const map: Record<string, string> = {};
    const resolve = async (ref: string) => {
      if (map[ref]) return map[ref];
      if (ref.startsWith("new:")) map[ref] = await findOrCreatePlayer(ctx, ref.slice(4));
      else {
        const id = ctx.db.normalizeId("players", ref);
        if (!id || !(await ctx.db.get(id))) throw new Error("Nieznany zawodnik w meczu.");
        map[ref] = id;
      }
      return map[ref];
    };
    const lineup: Record<string, "A" | "B"> = {};
    for (const [ref, t] of Object.entries(match.lineup)) lineup[await resolve(ref)] = t;
    const events = [];
    for (const e of match.events) events.push({ ...e, pid: await resolve(e.pid) });

    const doc = { ...match, lineup, events, updatedAt: Date.now() };
    const existing = await ctx.db.query("matches").withIndex("by_clientId", (q) => q.eq("clientId", match.clientId)).unique();
    let id;
    if (existing) {
      await ctx.db.replace(existing._id, doc);
      id = existing._id;
    } else id = await ctx.db.insert("matches", doc);

    // mecz rozegrany z zaplanowanego terminu
    if (match.gameId) {
      const g = await ctx.db.get(match.gameId);
      if (g && (g.status !== "played" || g.matchId !== id)) await ctx.db.patch(g._id, { status: "played", matchId: id });
    }
    const newRefs = Object.fromEntries(Object.entries(map).filter(([k, val]) => k !== val));
    return { id, map: newRefs };
  },
});

export const remove = mutation({
  args: { token: v.string(), id: v.id("matches") },
  handler: async (ctx, { token, id }) => {
    await requireAdmin(ctx, token);
    const m = await ctx.db.get(id);
    if (!m) return;
    if (m.gameId) {
      const g = await ctx.db.get(m.gameId);
      if (g && g.matchId === id) await ctx.db.patch(g._id, { matchId: undefined });
    }
    await ctx.db.delete(id);
  },
});
