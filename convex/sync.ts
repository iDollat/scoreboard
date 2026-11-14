import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/*
 * Synchronizacja aplikacji Scoreboard.
 *   pull({ since }) – rekordy zmienione / usunięte od podanego czasu
 *   push(...)       – zapis zmienionych i usunięcie skasowanych rekordów
 * Klient (store.js) trzyma kopię lokalnie i wysyła tylko różnice.
 */

const TABLES = ["players", "matches", "games", "signups"] as const;
type Table = (typeof TABLES)[number];

// Zapas czasu przy pobieraniu nowości – zmiany zapisane „równolegle”
// z odczytem nie mogą się zgubić. Podwójnie pobrany rekord nic nie psuje.
const OVERLAP_MS = 60_000;
const MAX_RECORD_BYTES = 200_000;

const perTable = <T>(item: T) =>
  v.object({ players: v.array(item), matches: v.array(item), games: v.array(item), signups: v.array(item) });

export const pull = query({
  args: { since: v.optional(v.number()) },
  handler: async (ctx, { since = 0 }) => {
    const from = Math.max(0, since - OVERLAP_MS);
    const now = Date.now();
    const upserts: Record<string, unknown[]> = {};
    const deletes: Record<string, string[]> = {};
    for (const t of TABLES) {
      const rows = await ctx.db
        .query(t)
        .withIndex("by_updatedAt", (q) => q.gt("updatedAt", from))
        .collect();
      upserts[t] = rows.map((r) => r.data);
      deletes[t] = [];
    }
    if (since > 0) {
      const gone = await ctx.db
        .query("deletions")
        .withIndex("by_deletedAt", (q) => q.gt("deletedAt", from))
        .collect();
      for (const d of gone) if (d.table in deletes) deletes[d.table].push(d.recId);
    }
    return { cursor: now, upserts, deletes };
  },
});

export const push = mutation({
  args: {
    upserts: perTable(v.any()),
    deletes: perTable(v.string()),
  },
  handler: async (ctx, { upserts, deletes }) => {
    const now = Date.now();
    for (const t of TABLES as readonly Table[]) {
      for (const data of upserts[t]) {
        if (!data || typeof data !== "object" || typeof data.id !== "string" || !data.id) {
          throw new Error(`Nieprawidłowy rekord w ${t}`);
        }
        if (JSON.stringify(data).length > MAX_RECORD_BYTES) throw new Error(`Za duży rekord w ${t}`);
        const existing = await ctx.db
          .query(t)
          .withIndex("by_recId", (q) => q.eq("recId", data.id))
          .unique();
        if (existing) await ctx.db.patch(existing._id, { data, updatedAt: now });
        else await ctx.db.insert(t, { recId: data.id, data, updatedAt: now });
        // rekord wrócił – usuń ślad po skasowaniu
        const tomb = await ctx.db
          .query("deletions")
          .withIndex("by_table_recId", (q) => q.eq("table", t).eq("recId", data.id))
          .unique();
        if (tomb) await ctx.db.delete(tomb._id);
      }
      for (const recId of deletes[t]) {
        const existing = await ctx.db
          .query(t)
          .withIndex("by_recId", (q) => q.eq("recId", recId))
          .unique();
        if (existing) await ctx.db.delete(existing._id);
        const tomb = await ctx.db
          .query("deletions")
          .withIndex("by_table_recId", (q) => q.eq("table", t).eq("recId", recId))
          .unique();
        if (tomb) await ctx.db.patch(tomb._id, { deletedAt: now });
        else await ctx.db.insert("deletions", { table: t, recId, deletedAt: now });
      }
    }
    return { at: now };
  },
});
