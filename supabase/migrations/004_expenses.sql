-- Operating expenses entered in the admin Finance tab (used for EBITDA).
create table if not exists expenses (
  id uuid primary key,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  category text not null,
  amount numeric(12,2) not null check (amount >= 0),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists expenses_month_idx on expenses(month);
alter table expenses enable row level security;
