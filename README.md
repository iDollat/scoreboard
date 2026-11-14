# ⚽ Hala DT

Zapisy na mecze, wynik na żywo, historia i statystyki sezonu. Strona: **https://hala-dt.netlify.app**

## Dla zawodników (bez konta)
- **Start**: najbliższy mecz, ostatnie wyniki, strzelcy sezonu.
- **Terminy**: zaplanowane mecze. Wpisujesz imię i klikasz *Gram / Może / Nie gram*. Telefon zapamiętuje, kim jesteś. Osoby ponad limit trafiają na listę rezerwową.
- **Historia**: wszystkie mecze z podsumowaniem, a mecze w trakcie na żywo.
- **Statystyki**: tabela sezonu, liderzy, rekordy i karta każdego zawodnika.

## Dla administratora (🔒 w prawym górnym rogu)
- planowanie meczów i wysyłanie linku do zapisów, ręczne dopisywanie zawodników,
- **układanie składów metodą przeciągnij i upuść** (albo *Wyrównaj* według siły z wyników),
- prowadzenie meczu na żywo: gole, samobóje, zmiany drużyn, cofanie. Działa też bez zasięgu: mecz zapisuje się na telefonie i wysyła później,
- sezony i zawodnicy: zmiana imion, łączenie duplikatów.

## Technicznie
- `app/` – aplikacja **React + Vite** (TypeScript) oraz backend **Convex** (`app/convex/`).
- Hosting: **Netlify** buduje `app/` według `netlify.toml`.
- Katalog główny (`index.html`) to strona przejściowa pod starym adresem GitHub Pages:
  przenosi historię meczów zapisaną w przeglądarce starej wersji do bazy i przekierowuje na Netlify.
- Szczegóły bazy, hasła administratora i wgrywania: [docs/BAZA.md](docs/BAZA.md).
