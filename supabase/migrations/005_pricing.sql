-- Pricing by vehicle size, add-ons, payout boosts and detailer price-change requests.
-- Run once in Supabase → SQL Editor.
alter table bookings add column if not exists size_fee numeric(10,2) not null default 0;
alter table bookings add column if not exists addons jsonb not null default '[]';
alter table bookings add column if not exists boost_count integer not null default 0;
alter table bookings add column if not exists boosted_at timestamptz;

create table if not exists price_changes (
  id uuid primary key,
  booking_id uuid not null references bookings(id) on delete cascade,
  detailer_id uuid not null references detailers(id) on delete cascade,
  old_price numeric(10,2) not null, new_price numeric(10,2) not null check (new_price > 0),
  reason text not null default '', photo_file text,
  status text not null default 'pending' check (status in ('pending','approved','declined','withdrawn')),
  created_at timestamptz not null default now(), decided_at timestamptz
);
create index if not exists price_changes_booking_idx on price_changes(booking_id);
alter table price_changes enable row level security;
