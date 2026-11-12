-- BluePalm Auto Care — Supabase / Postgres schema
-- Run in the Supabase SQL editor. All access goes through the Next.js server
-- using the service-role key, so RLS is enabled with NO public policies:
-- the anon key cannot read or write any table directly.

create table if not exists packages (
  id text primary key, name text not null, tagline text not null default '',
  base_price integer not null check (base_price > 0), features jsonb not null default '[]',
  duration_hint text not null default '', sort integer not null default 0, active boolean not null default true
);

create table if not exists service_zips (
  zip text primary key check (zip ~ '^\d{5}$'), city text not null, county text not null, enabled boolean not null default false
);

create table if not exists settings (key text primary key, value jsonb not null);

create table if not exists staff (
  email text primary key, role text not null check (role in ('admin','dispatcher')), name text not null default ''
);

create table if not exists customers (
  id uuid primary key, email text not null unique, name text not null, phone text not null default '',
  access_token text not null unique, loyalty_points integer not null default 0, created_at timestamptz not null default now()
);

create table if not exists detailers (
  id uuid primary key, name text not null, email text not null unique, phone text not null,
  business_name text not null default '', business_type text not null default 'individual', ein_last4 text not null default '',
  years_experience integer not null default 0, experience text not null default '',
  counties jsonb not null default '[]', availability jsonb not null default '[]',
  insurance_file text, insurance_expires date,
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  access_token text not null unique, agreement_accepted_at timestamptz not null,
  commission_rate numeric(5,4), onboarding jsonb not null default '{}', stripe_account_id text,
  admin_notes text not null default '', created_at timestamptz not null default now()
);

create table if not exists recurring_plans (
  id uuid primary key, customer_id uuid not null references customers(id) on delete cascade,
  frequency text not null check (frequency in ('biweekly','monthly')), package_id text not null,
  vehicle text not null, zip text not null, address text not null, city text not null, time_window text not null,
  preferred_detailer_id uuid references detailers(id) on delete set null,
  status text not null default 'active' check (status in ('active','paused','cancelled')),
  next_date date not null, created_at timestamptz not null default now()
);

create table if not exists bookings (
  id uuid primary key, ref text not null unique, customer_id uuid not null references customers(id) on delete restrict,
  zip text not null, address text not null, city text not null, vehicle text not null, vehicle_details text not null default '',
  package_id text not null, package_name text not null, price_estimate numeric(10,2),
  date date not null, time_window text not null,
  preferred_detailer_id uuid references detailers(id) on delete set null,
  instructions text not null default '',
  status text not null default 'requested' check (status in ('requested','confirmed','assigned','completed','cancelled')),
  detailer_id uuid references detailers(id) on delete set null,
  recurring_plan_id uuid references recurring_plans(id) on delete set null,
  commission_rate numeric(5,4), final_price numeric(10,2),
  payment_status text not null default 'unpaid', refund_amount numeric(10,2) not null default 0,
  payment_intent text, checkout_url text, cancel_reason text not null default '',
  promo_code text, discount_pct numeric(5,2) not null default 0,
  customer_rating smallint check (customer_rating between 1 and 5), customer_feedback text not null default '',
  created_at timestamptz not null default now(), completed_at timestamptz
);
create index if not exists bookings_status_idx on bookings(status, date);
create index if not exists bookings_customer_idx on bookings(customer_id);
create index if not exists bookings_detailer_idx on bookings(detailer_id);

create table if not exists messages (
  id uuid primary key, booking_id uuid not null references bookings(id) on delete cascade,
  sender text not null check (sender in ('customer','detailer','admin')), body text not null, created_at timestamptz not null default now()
);
create index if not exists messages_booking_idx on messages(booking_id);

create table if not exists outbox (
  id uuid primary key, channel text not null, "to" text not null, subject text not null default '', body text not null,
  status text not null, error text not null default '', created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['packages','service_zips','settings','staff','customers','detailers','recurring_plans','bookings','messages','outbox'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Private storage bucket for insurance certificates
insert into storage.buckets (id, name, public) values ('detailer-docs', 'detailer-docs', false) on conflict (id) do nothing;

-- Staff: create the user in Supabase Auth (Authentication → Users), then:
-- insert into staff (email, role, name) values ('owner@bluepalmautocare.com', 'admin', 'Owner');
-- Packages, launch ZIP codes and default settings are seeded automatically on first request.
