import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { isAdmin } from "./lib";

const SESSION_DAYS = 90;
const MAX_FAILS = 8; // nieudanych prób w ciągu 15 minut
const FAIL_WINDOW = 15 * 60_000;

/* Porównanie odporne na mierzenie czasu odpowiedzi */
function safeEqual(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/* Logowanie administratora. Hasło ustawia się zmienną środowiskową ADMIN_PASSWORD w Convex. */
export const login = action({
  args: { password: v.string() },
  handler: async (ctx, { password }): Promise<{ ok: true; token: string } | { ok: false; error: string }> => {
    const fails = await ctx.runQuery(internal.auth.recentFails, {});
    if (fails >= MAX_FAILS) return { ok: false, error: "Za dużo nieudanych prób. Spróbuj za kilkanaście minut." };
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) return { ok: false, error: "Hasło administratora nie jest ustawione na serwerze." };
    if (!safeEqual(password, expected)) {
      await ctx.runMutation(internal.auth.recordFail, {});
      return { ok: false, error: "Nieprawidłowe hasło." };
    }
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    await ctx.runMutation(internal.auth.createSession, { token });
    return { ok: true, token };
  },
});

export const recentFails = internalQuery({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("loginFails").withIndex("by_at", (q) => q.gt("at", Date.now() - FAIL_WINDOW)).collect()).length,
});

export const recordFail = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.db.insert("loginFails", { at: Date.now() });
    // sprzątanie starych wpisów
    const old = await ctx.db.query("loginFails").withIndex("by_at", (q) => q.lt("at", Date.now() - FAIL_WINDOW)).take(50);
    for (const f of old) await ctx.db.delete(f._id);
  },
});

export const createSession = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await ctx.db.insert("sessions", { token, expiresAt: Date.now() + SESSION_DAYS * 86400_000 });
    const expired = await ctx.db.query("sessions").filter((q) => q.lt(q.field("expiresAt"), Date.now())).take(50);
    for (const s of expired) await ctx.db.delete(s._id);
  },
});

export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const s = await ctx.db.query("sessions").withIndex("by_token", (q) => q.eq("token", token)).unique();
    if (s) await ctx.db.delete(s._id);
  },
});

export const check = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, { token }) => ({ admin: await isAdmin(ctx, token) }),
});
