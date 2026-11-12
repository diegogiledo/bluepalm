-- Run once in the Supabase SQL editor on an existing database.
-- Adds promotion tracking (e.g. WELCOME10) to bookings.
alter table bookings add column if not exists promo_code text;
alter table bookings add column if not exists discount_pct numeric(5,2) not null default 0;
