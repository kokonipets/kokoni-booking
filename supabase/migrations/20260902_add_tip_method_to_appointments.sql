-- Which method a tip was actually paid in, separate from payment_method —
-- a customer can pay the service by one method (e.g. card) and hand over
-- the tip in another (e.g. cash). Defaults to null; the cashier UI
-- pre-fills it to match the selected Payment Method but staff can change
-- it independently before confirming.
alter table appointments add column if not exists tip_method text
  check (tip_method is null or tip_method in ('card', 'cash', 'venmo', 'zelle'));
