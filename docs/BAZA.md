# Wspólna baza danych (Convex)

Frontend to statyczne pliki: HTML, CSS i JS w katalogu głównym, bez budowania. Dane trzyma **Convex**.
Przeglądarka łączy się z Convexem bezpośrednio przez jego publiczne HTTP API, bez dodatkowych bibliotek.

## Jak to działa
- `store.js` to warstwa danych. Każda zmiana trafia najpierw do pamięci telefonu (aplikacja działa bez internetu), a potem na serwer. Wysyłane są tylko zmienione rekordy.
- Co `pollSeconds` sekund (domyślnie 15) i po powrocie do aplikacji telefon pobiera tylko **nowości** od ostatniej synchronizacji, a nie całą bazę.
- Jeśli zmiany z telefonu nie zostały jeszcze wysłane, mają pierwszeństwo przed danymi z serwera.
- Wspólne są: **zawodnicy, mecze (także trwające, na żywo), terminy i zgłoszenia**.
  Na każdym urządzeniu osobno zostają: trwający u mnie mecz, „kim jestem”, tryb organizatora i wybrany sezon.
- Ten sam zawodnik dodany na dwóch telefonach, czyli to samo imię i różne id, jest scalany automatycznie razem z meczami i golami.

## Pliki
| Plik | Co robi |
|---|---|
| `config.js` | adres bazy Convex (`backend: 'convex'`) |
| `store.js` | synchronizacja (adapter Convex + scalanie zmian) |
| `convex/schema.ts` | tabele: `players`, `matches`, `games`, `signups` + `deletions` (ślady usunięć) |
| `convex/sync.ts` | funkcje serwera: `sync:pull` (nowości od czasu X) i `sync:push` (zapis/usunięcie) |

## Wgrywanie zmian w funkcjach serwera
Po zmianie czegokolwiek w folderze `convex/`:
```
npm install
npx convex deploy
```
Do wgrywania potrzebny jest **deploy key** (Convex → projekt → *Settings → URL & Deploy Key*), ustawiony w zmiennej `CONVEX_DEPLOY_KEY`.
Możesz też zalogować się raz przez `npx convex login`.

## Bezpieczeństwo
Funkcje są publiczne: każdy, kto zna adres strony, może czytać i zapisywać dane. Dla grupy znajomych to wystarcza.
Tryb organizatora to tylko przełącznik w aplikacji, a nie zabezpieczenie.
Następny krok, jeśli będzie potrzebny: PIN organizatora sprawdzany po stronie serwera w `sync:push` przy usuwaniu meczów i edycji terminów.

## Limity darmowego planu Convex
Pobieranie tylko nowości sprawia, że jedno otwarte urządzenie to kilka małych zapytań na minutę.
Przy grupie kilkudziesięciu osób limity darmowego planu są z dużym zapasem.
