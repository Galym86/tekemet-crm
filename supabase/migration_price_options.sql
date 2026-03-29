-- Миграция: города без цены, тарифы с названиями в отдельной таблице.
-- Выполните в SQL Editor ОДИН РАЗ, если проект уже создан по старому schema.sql.

create extension if not exists "pgcrypto";

-- Тарифы приёма: название + цена за м² в рамках города
create table if not exists public.price_options (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities (id) on delete cascade,
  name text not null,
  price_per_sqm numeric(12, 2) not null check (price_per_sqm >= 0),
  sort_order int not null default 0,
  created_at timestamptz default now(),
  unique (city_id, name)
);

create index if not exists idx_price_options_city on public.price_options (city_id);

-- Перенос старых цен из cities → три стартовых тарифа на город
insert into public.price_options (city_id, name, price_per_sqm, sort_order)
select c.id, 'Все виды ковров', c.price_per_sqm, 1
from public.cities c
where not exists (
  select 1 from public.price_options po
  where po.city_id = c.id and po.name = 'Все виды ковров'
);

insert into public.price_options (city_id, name, price_per_sqm, sort_order)
select c.id, 'Синтетика', c.price_per_sqm, 2
from public.cities c
where not exists (
  select 1 from public.price_options po
  where po.city_id = c.id and po.name = 'Синтетика'
);

insert into public.price_options (city_id, name, price_per_sqm, sort_order)
select c.id, 'Сильнозагрязнённые', c.price_per_sqm, 3
from public.cities c
where not exists (
  select 1 from public.price_options po
  where po.city_id = c.id and po.name = 'Сильнозагрязнённые'
);

-- Подпись к позиции заказа (снимок названия тарифа)
alter table public.order_items
  add column if not exists price_label text;

-- У города больше нет одной «цены за м²»
alter table public.cities
  drop column if exists price_per_sqm;

alter table public.price_options enable row level security;

drop policy if exists "anon_all_price_options" on public.price_options;
create policy "anon_all_price_options" on public.price_options for all using (true) with check (true);
