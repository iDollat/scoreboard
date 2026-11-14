import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/*
 * Każda kolekcja aplikacji to osobna tabela z rekordami w JSON:
 *   recId     – identyfikator rekordu nadany przez aplikację
 *   data      – cały rekord (zawodnik / mecz / termin / zgłoszenie)
 *   updatedAt – czas ostatniej zmiany (do pobierania tylko nowości)
 * Zmiana modelu danych w aplikacji nie wymaga migracji bazy.
 */
const record = defineTable({
  recId: v.string(),
  data: v.any(),
  updatedAt: v.number(),
})
  .index("by_recId", ["recId"])
  .index("by_updatedAt", ["updatedAt"]);

export default defineSchema({
  players: record,
  matches: record,
  games: record,
  signups: record,
  // Ślady usuniętych rekordów – żeby inne telefony też je usunęły
  deletions: defineTable({
    table: v.string(),
    recId: v.string(),
    deletedAt: v.number(),
  })
    .index("by_table_recId", ["table", "recId"])
    .index("by_deletedAt", ["deletedAt"]),
});
