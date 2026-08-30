-- Who absorbs a coupon's discount, for commission purposes:
--   'store'   — the salon absorbs it; the groomer's commission is calculated
--               on the FULL pre-discount price, as if the discount never
--               happened. Default. E.g. "First-time customer 20% off".
--   'groomer' — the groomer absorbs it; commission is calculated on the
--               discounted price actually collected. E.g. "Friend & Family 15%".
--   'split'   — half and half.
alter table coupons add column if not exists discount_bearer text not null default 'store'
  check (discount_bearer in ('store', 'groomer', 'split'));

-- Snapshot of which bearer applied to THIS appointment's discount, taken from
-- the coupon at checkout time — so editing or deleting the coupon later never
-- changes the commission math on a past appointment. Left null for
-- appointments with no discount, and for pre-existing appointments (commission
-- calculations treat a missing value as 'store', matching prior behavior).
alter table appointments add column if not exists discount_bearer text
  check (discount_bearer is null or discount_bearer in ('store', 'groomer', 'split'));
