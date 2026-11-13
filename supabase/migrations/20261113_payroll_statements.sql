-- Payroll statements the admin has "sent" to each groomer (PDF snapshot + summary numbers).
-- Groomers see them in the Payroll tab of the groomer dashboard.
create table if not exists public.payroll_statements (
  id uuid primary key default gen_random_uuid(),
  groomer_name text not null,
  period_start date not null,
  period_end date not null,
  pay_date date,
  total_pay numeric(10,2) not null default 0,
  summary jsonb,
  pdf_path text not null,
  sent_by text,
  sent_at timestamptz not null default now()
);
create index if not exists payroll_statements_groomer_idx on public.payroll_statements (groomer_name, pay_date desc);
create index if not exists payroll_statements_paydate_idx on public.payroll_statements (pay_date desc, sent_at desc);

-- Only the server (service role) reads/writes this table — block the public anon key.
alter table public.payroll_statements enable row level security;

-- Private bucket for the PDF files (served to groomers through short-lived signed links).
insert into storage.buckets (id, name, public)
values ('payroll-statements', 'payroll-statements', false)
on conflict (id) do nothing;
