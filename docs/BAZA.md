# Baza danych (Convex) i administrator

## Struktura
| Plik | Co robi |
|---|---|
| `app/convex/schema.ts` | tabele: `players`, `matches`, `games` (terminy), `signups` (zgłoszenia), `settings`, `sessions` |
| `app/convex/auth.ts` | logowanie administratora (hasło z `ADMIN_PASSWORD`), sesje na 90 dni, blokada po 8 błędnych próbach w ciągu 15 minut |
| `app/convex/games.ts` | terminy, zapisy (publiczne), zgłoszenia i składy (administrator) |
| `app/convex/matches.ts` | mecze: odczyt publiczny, zapis i usuwanie tylko przez administratora |
| `app/convex/players.ts` | zawodnicy, zmiana imion i łączenie duplikatów (administrator) |
| `app/convex/legacy.ts` | jednorazowy import historii ze starej wersji (tylko dopisuje, działa do `LEGACY_IMPORT_UNTIL`, domyślnie 2027-03-01) |

Uprawnienia sprawdza **serwer**: bez ważnej sesji administratora nie da się zmienić meczów, terminów ani składów.
Zawodnicy bez konta mogą tylko zapisywać się na otwarte terminy.

## Hasło administratora
Zmiana hasła (w folderze `app/`):
```
npx convex env set ADMIN_PASSWORD "nowe-haslo"
```
Zmiana hasła nie wylogowuje osób już zalogowanych. Żeby wylogować wszystkich:
```
npx convex run auth:revokeAllSessions
```

## Wymiana listy zawodników
Tylko gdy nie ma jeszcze rozegranych meczów (funkcja odmówi, jeśli są):
```
npx convex run migrate:replacePlayers '{"names": ["Adam C.", "Bartek K."]}'
```

## Wgrywanie zmian w backendzie
W folderze `app/` z kluczem w `app/.env` (`CONVEX_DEPLOY_KEY=...`, plik nie trafia do gita):
```
npm install
npx convex deploy
```
Frontend buduje się sam na Netlify po każdym pushu na `main`.

## Lokalnie
```
cd app
npm install
npx convex dev    # lokalna baza testowa
npm run dev       # aplikacja na http://localhost:5173
```
