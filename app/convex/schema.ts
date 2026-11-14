import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const team = v.union(v.literal("A"), v.literal("B"));
export const signupStatus = v.union(v.literal("in"), v.literal("maybe"), v.literal("out"));

/* Zdarzenie meczu: gol (team = drużyna strzelca w chwili gola, own = samobój)
   albo zmiana drużyny (from -> to). pid = id zawodnika, t = ms od początku. */
export const matchEvent = v.object({
  id: v.string(),
  type: v.union(v.literal("goal"), v.literal("switch")),
  pid: v.string(),
  team: v.optional(team),
  own: v.optional(v.boolean()),
  from: v.optional(team),
  to: v.optional(team),
  t: v.number(),
});

export const matchFields = {
  clientId: v.string(), // id nadane na telefonie – mecz da się zapisywać offline
  season: v.string(),
  gameId: v.optional(v.id("games")),
  status: v.union(v.literal("live"), v.literal("done")),
  startedAt: v.number(),
  endedAt: v.optional(v.number()),
  pausedAt: v.optional(v.number()),
  pausedMs: v.number(),
  teams: v.object({ A: v.string(), B: v.string() }),
  lineup: v.record(v.string(), team), // id zawodnika -> drużyna (na koniec meczu)
  events: v.array(matchEvent),
};

export default defineSchema({
  players: defineTable({
    name: v.string(),
    key: v.string(), // imię znormalizowane – do wyszukiwania i unikania duplikatów
    legacyId: v.optional(v.string()),
  })
    .index("by_key", ["key"])
    .index("by_legacyId", ["legacyId"]),

  matches: defineTable({ ...matchFields, updatedAt: v.number() })
    .index("by_clientId", ["clientId"])
    .index("by_startedAt", ["startedAt"]),

  // Zaplanowane mecze (terminy) z zapisami
  games: defineTable({
    date: v.string(), // RRRR-MM-DD
    time: v.string(),
    place: v.string(),
    limit: v.number(), // 0 = bez limitu
    note: v.string(),
    status: v.union(v.literal("open"), v.literal("played"), v.literal("cancelled")),
    teams: v.optional(
      v.object({ A: v.string(), B: v.string(), lineup: v.record(v.string(), team), published: v.boolean() }),
    ),
    matchId: v.optional(v.id("matches")),
    createdAt: v.number(),
    legacyId: v.optional(v.string()),
  })
    .index("by_status_date", ["status", "date"])
    .index("by_legacyId", ["legacyId"]),

  signups: defineTable({
    gameId: v.id("games"),
    playerId: v.id("players"),
    status: signupStatus,
    by: v.union(v.literal("self"), v.literal("admin")),
    at: v.number(), // kolejność na liście (rezerwa wg czasu zapisu)
  })
    .index("by_game", ["gameId"])
    .index("by_game_player", ["gameId", "playerId"])
    .index("by_player", ["playerId"]),

  settings: defineTable({
    season: v.optional(v.string()), // brak = sezon automatycznie z daty
    seasons: v.array(v.string()),
  }),

  // Sesje administratora (logowanie hasłem z ADMIN_PASSWORD)
  sessions: defineTable({ token: v.string(), expiresAt: v.number() }).index("by_token", ["token"]),
  loginFails: defineTable({ at: v.number() }).index("by_at", ["at"]),

  // Pozostałość po poprzedniej wersji synchronizacji (nieużywana)
  deletions: defineTable(v.any()),
});
