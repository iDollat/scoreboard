import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const nameKey = (name: string) =>
  name.trim().replace(/\s+/g, " ").toLocaleLowerCase("pl").normalize("NFC");
export const cleanName = (name: string) => name.trim().replace(/\s+/g, " ").slice(0, 40);

/* Sprawdza sesję administratora – rzuca błąd, jeśli brak uprawnień */
export async function requireAdmin(ctx: QueryCtx | MutationCtx, token: string | undefined) {
  if (!(await isAdmin(ctx, token))) throw new Error("Brak uprawnień administratora – zaloguj się ponownie.");
}
export async function isAdmin(ctx: QueryCtx | MutationCtx, token: string | undefined) {
  if (!token) return false;
  const s = await ctx.db.query("sessions").withIndex("by_token", (q) => q.eq("token", token)).unique();
  return !!s && s.expiresAt > Date.now();
}

/* Znajduje zawodnika po imieniu albo go tworzy */
export async function findOrCreatePlayer(ctx: MutationCtx, rawName: string): Promise<Id<"players">> {
  const name = cleanName(rawName);
  if (!name) throw new Error("Podaj imię zawodnika.");
  const key = nameKey(name);
  const existing = await ctx.db.query("players").withIndex("by_key", (q) => q.eq("key", key)).first();
  if (existing) return existing._id;
  return await ctx.db.insert("players", { name, key });
}

/* Sezon piłkarski: od 1 lipca do 30 czerwca, np. listopad 2026 → "2026/2027" */
export function seasonFor(ts: number = Date.now()) {
  const d = new Date(ts);
  const start = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${start}/${start + 1}`;
}
export const isOldSeasonName = (s: string) => /^\d{4}$/.test(s);

/* Bieżący sezon: wybrany przez administratora albo – domyślnie – wynikający z daty */
export async function getSettings(ctx: QueryCtx | MutationCtx) {
  const s = await ctx.db.query("settings").first();
  const auto = seasonFor();
  const season = s?.season && !isOldSeasonName(s.season) ? s.season : auto;
  const seasons = [...new Set([...(s?.seasons ?? []).filter((x) => !isOldSeasonName(x)), auto, season])];
  return { _id: s?._id ?? null, season, seasons, manual: !!s?.season && season !== auto };
}
