import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { cleanName, findOrCreatePlayer, nameKey, requireAdmin } from "./lib";

export const list = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query("players").collect()).map(({ _id, name }) => ({ _id, name })),
});

export const add = mutation({
  args: { token: v.string(), name: v.string() },
  handler: async (ctx, { token, name }) => {
    await requireAdmin(ctx, token);
    return await findOrCreatePlayer(ctx, name);
  },
});

/* Zmiana imienia. Jeśli imię należy już do innego zawodnika – zawodnicy są łączeni. */
export const rename = mutation({
  args: { token: v.string(), id: v.id("players"), name: v.string() },
  handler: async (ctx, { token, id, name }) => {
    await requireAdmin(ctx, token);
    const clean = cleanName(name);
    if (!clean) throw new Error("Podaj imię.");
    const key = nameKey(clean);
    const dup = await ctx.db.query("players").withIndex("by_key", (q) => q.eq("key", key)).first();
    if (dup && dup._id !== id) {
      await mergeInto(ctx, id, dup._id);
      return { merged: true, into: dup._id };
    }
    await ctx.db.patch(id, { name: clean, key });
    return { merged: false };
  },
});

export const remove = mutation({
  args: { token: v.string(), id: v.id("players") },
  handler: async (ctx, { token, id }) => {
    await requireAdmin(ctx, token);
    const matches = await ctx.db.query("matches").collect();
    if (matches.some((m) => id in m.lineup || m.events.some((e) => e.pid === id)))
      throw new Error("Zawodnik ma rozegrane mecze – możesz zmienić mu imię albo połączyć z innym.");
    for (const s of await ctx.db.query("signups").withIndex("by_player", (q) => q.eq("playerId", id)).collect())
      await ctx.db.delete(s._id);
    await ctx.db.delete(id);
  },
});

/* Przepisuje wszystko z zawodnika `from` na `to` i usuwa `from` */
async function mergeInto(ctx: MutationCtx, from: Id<"players">, to: Id<"players">) {
  const swap = (rec: Record<string, "A" | "B">) => {
    if (!(from in rec)) return rec;
    const out = { ...rec };
    if (!(to in out)) out[to] = out[from];
    delete out[from];
    return out;
  };
  for (const m of await ctx.db.query("matches").collect()) {
    if (!(from in m.lineup) && !m.events.some((e) => e.pid === from)) continue;
    await ctx.db.patch(m._id, {
      lineup: swap(m.lineup),
      events: m.events.map((e) => (e.pid === from ? { ...e, pid: to } : e)),
      updatedAt: Date.now(),
    });
  }
  for (const g of await ctx.db.query("games").collect())
    if (g.teams && from in g.teams.lineup) await ctx.db.patch(g._id, { teams: { ...g.teams, lineup: swap(g.teams.lineup) } });
  for (const s of await ctx.db.query("signups").withIndex("by_player", (q) => q.eq("playerId", from)).collect()) {
    const dup = await ctx.db
      .query("signups")
      .withIndex("by_game_player", (q) => q.eq("gameId", s.gameId).eq("playerId", to))
      .unique();
    if (dup) await ctx.db.delete(s._id);
    else await ctx.db.patch(s._id, { playerId: to });
  }
  await ctx.db.delete(from);
}
