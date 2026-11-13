-- Local detailing businesses BluePalm sends customers to, and the job
-- requests emailed to them. Run once in Supabase → SQL Editor.
alter table detailers add column if not exists source text not null default 'applied';

create table if not exists market_detailers (
  id uuid primary key,
  business_name text not null, owner_name text, email text unique, phone text,
  website text, logo_url text, city text not null default '',
  counties jsonb not null default '[]', mobile boolean not null default true,
  address text, lat double precision, lon double precision, radius_miles numeric(5,1) not null default 15,
  source_url text, notes text not null default '',
  status text not null default 'new' check (status in ('new','invited','opted_in','unsubscribed')),
  token text not null unique,
  invited_at timestamptz, opted_in_at timestamptz, unsubscribed_at timestamptz,
  detailer_id uuid references detailers(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists job_offers (
  id uuid primary key,
  booking_id uuid not null references bookings(id) on delete cascade,
  market_detailer_id uuid not null references market_detailers(id) on delete cascade,
  token text not null unique,
  status text not null default 'sent' check (status in ('sent','accepted','passed','taken')),
  sent_at timestamptz not null default now(), responded_at timestamptz
);
create index if not exists job_offers_booking_idx on job_offers(booking_id);
create index if not exists job_offers_detailer_idx on job_offers(market_detailer_id);

alter table market_detailers enable row level security;
alter table job_offers enable row level security;
