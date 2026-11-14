import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getSettings, requireAdmin, seasonFor } from "./lib";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const s = await getSettings(ctx);
    return { season: s.season, seasons: s.seasons, auto: seasonFor() };
  },
});

/* Ustawia bieżący sezon (nowy sezon jest dopisywany do listy) */
export const setSeason = mutation({
  args: { token: v.string(), season: v.string() },
  handler: async (ctx, { token, season }) => {
    await requireAdmin(ctx, token);
    const name = season.trim().slice(0, 30);
    if (!name) throw new Error("Podaj nazwę sezonu.");
    const s = await getSettings(ctx);
    const seasons = s.seasons.includes(name) ? s.seasons : [...s.seasons, name];
    // wybór sezonu wynikającego z daty = powrót do trybu automatycznego
    const chosen = name === seasonFor() ? undefined : name;
    if (s._id) await ctx.db.patch(s._id, { season: chosen, seasons });
    else await ctx.db.insert("settings", { season: chosen, seasons });
  },
});
