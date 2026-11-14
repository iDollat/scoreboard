import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { cleanName, getSettings, nameKey } from "./lib";

/*
 * Import historii ze starej wersji strony (dane z przeglądarki telefonu).
 * Wywołuje go strona przejściowa pod starym adresem GitHub Pages.
 * Publiczny, ale tylko DOPISUJE brakujące mecze i zawodników (niczego nie zmienia
 * ani nie usuwa) i działa do daty z LEGACY_IMPORT_UNTIL (domyślnie 2027-03-01).
 */
const team = (t: unknown): "A" | "B" | undefined => (t === "A" || t === "B" ? t : undefined);
const num = (n: unknown, d = 0) => (typeof n === "number" && isFinite(n) ? n : d);
const str = (s: unknown, max = 60) => (typeof s === "string" ? s.slice(0, max) : "");

export const importLocal = mutation({
  args: { data: v.any() },
  handler: async (ctx, { data }) => {
    const until = Date.parse(process.env.LEGACY_IMPORT_UNTIL || "2027-03-01");
    if (Date.now() > until) throw new Error("Import starych danych jest już wyłączony.");
    if (!data || !Array.isArray(data.players) || !Array.isArray(data.matches)) throw new Error("Nieprawidłowe dane.");
    if (JSON.stringify(data).length > 4_000_000) throw new Error("Za dużo danych.");

    // zawodnicy: po starym id albo po imieniu
    const ids: Record<string, Id<"players">> = {};
    let players = 0;
    for (const p of data.players.slice(0, 2000)) {
      const legacyId = str(p?.id, 40);
      const name = cleanName(str(p?.name, 40));
      if (!legacyId || !name) continue;
      const byLegacy = await ctx.db.query("players").withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId)).first();
      const byKey = byLegacy ?? (await ctx.db.query("players").withIndex("by_key", (q) => q.eq("key", nameKey(name))).first());
      if (byKey) ids[legacyId] = byKey._id;
      else {
        ids[legacyId] = await ctx.db.insert("players", { name, key: nameKey(name), legacyId });
        players++;
      }
    }

    // mecze: tylko zakończone, których jeszcze nie ma
    let matches = 0;
    const seasons = new Set<string>();
    for (const m of data.matches.slice(0, 5000)) {
      if (m?.status !== "done" || typeof m.id !== "string") continue;
      const clientId = "legacy:" + m.id.slice(0, 40);
      const exists = await ctx.db.query("matches").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).unique();
      if (exists) continue;
      const lineup: Record<string, "A" | "B"> = {};
      for (const [pid, t] of Object.entries(m.lineup ?? {})) if (ids[pid] && team(t)) lineup[ids[pid]] = team(t)!;
      const events = (Array.isArray(m.events) ? m.events : [])
        .filter((e: any) => e && ids[e.pid] && (e.type === "goal" || e.type === "switch"))
        .map((e: any) => ({
          id: str(e.id, 40) || Math.random().toString(36).slice(2),
          type: e.type as "goal" | "switch",
          pid: ids[e.pid],
          t: num(e.t),
          ...(e.type === "goal" ? { team: team(e.team) ?? "A", own: !!e.own } : { from: team(e.from) ?? "A", to: team(e.to) ?? "B" }),
        }));
      const season = str(m.season, 30) || String(new Date(num(m.startedAt, Date.now())).getFullYear());
      seasons.add(season);
      await ctx.db.insert("matches", {
        clientId,
        season,
        status: "done",
        startedAt: num(m.startedAt, Date.now()),
        endedAt: num(m.endedAt, num(m.startedAt, Date.now())),
        pausedMs: num(m.pausedMs),
        teams: { A: str(m.teams?.A, 20) || "Drużyna A", B: str(m.teams?.B, 20) || "Drużyna B" },
        lineup,
        events,
        updatedAt: Date.now(),
      });
      matches++;
    }

    // sezony
    for (const s of Array.isArray(data.seasons) ? data.seasons : []) if (typeof s === "string" && s) seasons.add(s.slice(0, 30));
    if (seasons.size) {
      const st = await getSettings(ctx);
      const all = [...new Set([...st.seasons, ...seasons])];
      if (st._id) await ctx.db.patch(st._id, { seasons: all });
      else await ctx.db.insert("settings", { season: st.season, seasons: all });
    }
    return { players, matches };
  },
});
