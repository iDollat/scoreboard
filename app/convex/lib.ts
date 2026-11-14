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

export async function getSettings(ctx: QueryCtx | MutationCtx) {
  const s = await ctx.db.query("settings").first();
  const y = String(new Date().getFullYear());
  return s ?? { _id: null, season: y, seasons: [y] };
}
