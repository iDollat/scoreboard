/* =========================================================
   Konfiguracja wspólnej bazy danych (Convex)
   ---------------------------------------------------------
   backend: 'convex' – dane wspólne dla wszystkich
   backend: 'local'  – dane tylko na tym urządzeniu

   Adres bazy jest publiczny z założenia (widzi go każda przeglądarka).
   Funkcje serwera: convex/sync.ts, instrukcja: docs/BAZA.md
   ========================================================= */
window.SCOREBOARD_CONFIG = {
  backend: 'convex',
  convex: {
    url: 'https://befitting-spoonbill-988.eu-west-1.convex.cloud',
  },
  pollSeconds: 15, // co ile sekund pobierać zmiany od innych
};
