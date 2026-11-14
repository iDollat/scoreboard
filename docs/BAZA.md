# Podłączenie wspólnej bazy danych

Na razie aplikacja zapisuje wszystko w przeglądarce, osobno na każdym telefonie.
Kod jest już przygotowany pod wspólną bazę. Wystarczy ją założyć i wpisać dane do `config.js`.

## Jak to działa
- `store.js` to warstwa danych. Każda zmiana trafia najpierw do pamięci telefonu (działa bez internetu), a potem na serwer. Wysyłane są tylko zmienione rekordy.
- Co `pollSeconds` sekund (i po powrocie do aplikacji) pobierane są zmiany od innych osób. Jeśli zmiany z telefonu nie zostały jeszcze wysłane, mają pierwszeństwo.
- Wspólne są: **zawodnicy, mecze, terminy (zapisy) i zgłoszenia**. Na każdym urządzeniu osobno zostają: trwający mecz, „kim jestem”, tryb organizatora i wybrany sezon.
- Każde zgłoszenie na mecz to osobny rekord, więc kilka osób może zapisywać się jednocześnie bez nadpisywania się nawzajem.

## Krok po kroku (Supabase, darmowy plan)
1. Załóż konto na https://supabase.com i utwórz projekt.
2. **SQL Editor → New query**: wklej zawartość `supabase/schema.sql` i kliknij **Run**.
3. **Project Settings → API**: skopiuj **Project URL** i klucz **anon public**.
4. W `config.js` ustaw:
   ```js
   backend: 'supabase',
   supabase: { url: 'https://xxxx.supabase.co', anonKey: 'eyJ...' },
   ```
5. Zrób commit i push. GitHub Pages dalej hostuje stronę za darmo, a Supabase przechowuje dane.

Przy pierwszym uruchomieniu telefon wyśle do bazy swoje dotychczasowe dane, czyli zawodników i historię meczów.
**Zrób to najpierw na telefonie, na którym masz całą historię.** Jeśli inne telefony mają własnych zawodników o tych samych imionach,
mogą pojawić się duplikaty. Połączysz je w zakładce *Więcej → Zawodnicy* (zmień imię na istniejące).

## Bezpieczeństwo
Klucz `anon` jest publiczny z założenia. Dostęp chronią reguły RLS w bazie.
Etap 1 w `schema.sql` pozwala zapisywać każdemu, kto ma link, co wystarcza dla grupy znajomych.
Etap 2 (opisany w pliku) ogranicza zmiany meczów do zalogowanego organizatora. Wymaga to dodania logowania w aplikacji.

## Status
Adapter Supabase (`SupabaseAdapter` w `store.js`) jest gotowy, ale **nie był jeszcze testowany z prawdziwą bazą**.
Logikę synchronizacji sprawdziłem na lokalnej atrapie serwera, która udaje API Supabase.
