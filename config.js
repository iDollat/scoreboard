/* =========================================================
   Konfiguracja wspólnej bazy danych
   ---------------------------------------------------------
   backend: 'local'    – dane tylko na tym urządzeniu (domyślnie)
   backend: 'supabase' – dane wspólne dla wszystkich (instrukcja w docs/BAZA.md)

   Klucz "anon" Supabase jest publiczny z założenia – można go trzymać
   w repozytorium. Dostęp do danych chronią reguły (RLS) w bazie.
   ========================================================= */
window.SCOREBOARD_CONFIG = {
  backend: 'local',
  supabase: {
    url: '',      // np. 'https://abcdefgh.supabase.co'
    anonKey: '',  // Project Settings → API → anon public
  },
  pollSeconds: 30, // co ile sekund pobierać zmiany od innych
};
