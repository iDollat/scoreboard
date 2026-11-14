-- =========================================================
-- Scoreboard – schemat wspólnej bazy (Supabase / PostgreSQL)
-- Wklej całość w: Supabase → SQL Editor → New query → Run
-- =========================================================
-- Każda kolekcja aplikacji to osobna tabela z rekordami w JSON:
--   id         – identyfikator rekordu z aplikacji
--   data       – cały rekord (zawodnik / mecz / termin / zgłoszenie)
--   updated_at – kiedy ostatnio zmieniony
-- Dzięki temu zmiana modelu danych w aplikacji nie wymaga migracji bazy.

create table if not exists players (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists matches (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists games   (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists signups (
  id text primary key,                                    -- "<id meczu>:<id zawodnika>"
  data jsonb not null,
  updated_at timestamptz not null default now(),
  game_id text generated always as (data->>'gameId') stored
);
create index if not exists signups_game_idx on signups (game_id);

alter table players enable row level security;
alter table matches enable row level security;
alter table games   enable row level security;
alter table signups enable row level security;

-- ---------------------------------------------------------
-- ETAP 1 (na start): każdy z linkiem może czytać i zapisywać.
-- Proste i wystarczające dla zamkniętej grupy znajomych,
-- ale technicznie ktoś obcy z linkiem mógłby zmienić dane.
-- ---------------------------------------------------------
create policy "czytanie dla wszystkich" on players for select using (true);
create policy "czytanie dla wszystkich" on matches for select using (true);
create policy "czytanie dla wszystkich" on games   for select using (true);
create policy "czytanie dla wszystkich" on signups for select using (true);

create policy "zapis dla wszystkich" on players for all using (true) with check (true);
create policy "zapis dla wszystkich" on matches for all using (true) with check (true);
create policy "zapis dla wszystkich" on games   for all using (true) with check (true);
create policy "zapis dla wszystkich" on signups for all using (true) with check (true);

-- ---------------------------------------------------------
-- ETAP 2 (później): mecze, terminy i zawodników zmienia tylko
-- zalogowany organizator, a zgłoszenia – każdy.
-- Wymaga dodania logowania organizatora w aplikacji
-- (Supabase Auth, np. link na e-mail). Wtedy:
--
-- drop policy "zapis dla wszystkich" on matches;
-- drop policy "zapis dla wszystkich" on games;
-- create policy "zapis organizatora" on matches for all to authenticated using (true) with check (true);
-- create policy "zapis organizatora" on games   for all to authenticated using (true) with check (true);
-- (players i signups zostają otwarte – zawodnik musi móc się dopisać)
-- ---------------------------------------------------------
