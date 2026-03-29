-- =============================================================================
-- CRM стирки ковров — ПОЛНАЯ установка схемы в Supabase
-- =============================================================================
-- Как применить: Supabase Dashboard → SQL Editor → New query → вставить ВЕСЬ
-- этот файл → Run. Подробно: см. файл supabase/КАК_СОЗДАТЬ_ТАБЛИЦЫ.txt
-- Уже есть старая схема с price_per_sqm на cities? → сначала migration_price_options.sql
-- =============================================================================

create extension if not exists "pgcrypto";

-- Города (только название и порядок; цены — в price_options)
create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

-- Тарифы приёма: «Все виды ковров», «Синтетика», … + ₸/м² по городу
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

-- Тарифы цеха (одна строка)
create table if not exists public.workshop_settings (
  id smallint primary key default 1 check (id = 1),
  wash_fee_tg numeric(12, 2) not null default 150,
  assemble_fee_tg numeric(12, 2) not null default 50,
  pack_fee_tg numeric(12, 2) not null default 50
);

insert into public.workshop_settings (id) values (1)
on conflict (id) do nothing;

-- Клиенты
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text not null default '',
  city_id uuid references public.cities (id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_clients_phone on public.clients (phone);

-- Заказы
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  city_id uuid not null references public.cities (id),
  comment text,
  created_at timestamptz default now()
);

create index if not exists idx_orders_created on public.orders (created_at desc);

-- Позиции заказа (ковры)
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  area_sqm numeric(12, 2) not null check (area_sqm > 0),
  unit_price numeric(12, 2) not null,
  price_label text,
  washed boolean not null default false,
  assembled boolean not null default false,
  packed boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists idx_order_items_order on public.order_items (order_id);

-- Начальные города
insert into public.cities (name, sort_order)
values
  ('Жезказган', 1),
  ('Сатпаев', 2)
on conflict (name) do nothing;

-- Тарифы по умолчанию для каждого города (можно менять в приложении)
insert into public.price_options (city_id, name, price_per_sqm, sort_order)
select c.id, v.name, v.price, v.ord
from public.cities c
cross join (
  values
    ('Все виды ковров', 500::numeric, 1),
    ('Синтетика', 480::numeric, 2),
    ('Сильнозагрязнённые', 550::numeric, 3)
) as v(name, price, ord)
where c.name in ('Жезказган', 'Сатпаев')
on conflict (city_id, name) do nothing;

-- RLS
alter table public.cities enable row level security;
alter table public.price_options enable row level security;
alter table public.workshop_settings enable row level security;
alter table public.clients enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "anon_all_cities" on public.cities;
create policy "anon_all_cities" on public.cities for all using (true) with check (true);

drop policy if exists "anon_all_price_options" on public.price_options;
create policy "anon_all_price_options" on public.price_options for all using (true) with check (true);

drop policy if exists "anon_all_workshop_settings" on public.workshop_settings;
create policy "anon_all_workshop_settings" on public.workshop_settings for all using (true) with check (true);

drop policy if exists "anon_all_clients" on public.clients;
create policy "anon_all_clients" on public.clients for all using (true) with check (true);

drop policy if exists "anon_all_orders" on public.orders;
create policy "anon_all_orders" on public.orders for all using (true) with check (true);

drop policy if exists "anon_all_order_items" on public.order_items;
create policy "anon_all_order_items" on public.order_items for all using (true) with check (true);
