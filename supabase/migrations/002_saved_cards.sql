-- Run once in the Supabase SQL editor on an existing database.
-- Card / Apple Pay saved at booking (Stripe), charged after the service.
alter table bookings add column if not exists stripe_customer_id text;
alter table bookings add column if not exists payment_method_id text;
alter table bookings add column if not exists card_label text;
alter table bookings add column if not exists payment_error text;
