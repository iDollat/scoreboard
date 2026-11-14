# ⚽ Scoreboard

Licznik wyniku meczu piłkarskiego na telefon: strzelcy, zmiany drużyn, podsumowanie meczu, historia i statystyki sezonu.

## Jak używać
1. **Mecz → Nowy mecz**: wpisz nazwy drużyn i dodaj zawodników (dotknięcie przenosi ich między drużynami). Możesz też wylosować składy albo wziąć je z ostatniego meczu.
2. **W trakcie meczu**:
   - dotknij zawodnika, żeby dodać mu gola,
   - albo wpisz imię w pole „Kto strzelił?” i wybierz drużynę. Nowy zawodnik zostanie dopisany sam. Jeśli wybierzesz drugą drużynę, zawodnik zostanie do niej przeniesiony,
   - **⋯** przy zawodniku: samobój, przeniesienie do drugiej drużyny, usunięcie z meczu,
   - każdą akcję da się cofnąć: przyciskiem „Cofnij” albo **×** w przebiegu meczu.
3. **Zakończ mecz**: wyświetli się podsumowanie (król strzelców, hat-tricki, comeback, gol na wagę zwycięstwa, przebieg). Przyciskiem „Udostępnij” wyślesz wynik np. na grupę.
4. **Historia / Statystyki**: wszystkie mecze oraz tabela sezonu (mecze, W/R/P, gole, średnia, punkty, forma) i rekordy.

## Dane
W zakładce **Więcej** możesz:
- wyeksportować kopię do pliku i zaimportować ją na innym telefonie (z łączeniem danych),
- rozpocząć nowy sezon,
- poprawić imiona zawodników i połączyć duplikaty.

## Zapisy na mecz i składy
- **Zapisy**: organizator planuje mecz (data, miejsce, limit) i wysyła **link do zapisów**. Zawodnicy klikają *Gram / Może / Nie gram*, a osoby ponad limit trafiają na listę rezerwową. Organizator może też dopisać kogoś ręcznie.
- **Składy**: siła zawodników jest liczona z wyników, a przycisk *Wyrównaj* dzieli ich na równe drużyny. Jednym kliknięciem startuje mecz z tymi składami.
- Tryb organizatora włącza się w zakładce **Więcej**.

## Wspólna baza (Convex)
Zawodnicy, mecze, statystyki i zapisy są wspólne dla wszystkich, a kopia na telefonie pozwala działać bez internetu.
Szczegóły i wgrywanie funkcji serwera: [docs/BAZA.md](docs/BAZA.md). Stary adres `/update/` przekierowuje na stronę główną.

## Hosting
Strona jest statyczna (HTML + CSS + JS, bez budowania), więc działa na darmowym GitHub Pages:
**Settings → Pages → Deploy from a branch → `main` / root**.
Po dodaniu do ekranu głównego działa jak aplikacja, także offline.
