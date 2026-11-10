-- Promo code a client arrived with when booking online, e.g. from a link like
-- https://book.kokonipets.com/book?promo=DOUBLE11 sent in an announcement.
-- The matching coupon is pre-selected at checkout so staff don't have to
-- remember to apply it. Null for every appointment booked without a promo link.
alter table appointments add column if not exists promo_code text;
