-- SMS Review System: Automated review collection & response management
-- Tables: reviews, review_settings, review_alerts, review_activity_log

-- ─────────────────────────────────────────────────────────────────────────────
-- reviews: Store all customer review responses
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  appointment_id uuid references appointments(id) on delete cascade,
  client_phone text not null,
  client_name text,
  rating integer check (rating >= 1 and rating <= 5),
  response_text text,
  feedback_text text,
  review_request_sent_at timestamptz,
  rating_received_at timestamptz,
  feedback_received_at timestamptz,
  review_link_sent text,
  status text not null default 'pending' check (status in ('pending', 'rated', 'positive', 'negative', 'feedback_received', 'archived')),
  attempt_count integer default 1,
  last_attempt_at timestamptz,
  notes text
);

create index if not exists reviews_created_idx on reviews (created_at desc);
create index if not exists reviews_client_idx on reviews (client_phone);
create index if not exists reviews_status_idx on reviews (status);
create index if not exists reviews_rating_idx on reviews (rating) where rating is not null;
create index if not exists reviews_appointment_idx on reviews (appointment_id);
create index if not exists reviews_sent_at_idx on reviews (review_request_sent_at) where review_request_sent_at is not null;
create index if not exists reviews_pending_idx on reviews (status, created_at desc) where status in ('pending', 'rated');

-- ─────────────────────────────────────────────────────────────────────────────
-- review_settings: Configuration for SMS templates, schedules, and review URLs
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists review_settings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- SMS Templates
  review_request_template text default 'Hi {client_name}! 👋 Thanks for choosing Kokoni Pet Grooming Salon! How would you rate your experience? Reply with 1-5 (1=poor, 5=excellent)',
  positive_response_template text default 'Thank you for the 5-star rating! 🌟 Please share your experience: {google_url} or {yelp_url}',
  feedback_request_template text default 'We\'d love to hear more! What could we have done better? Reply with your thoughts.',
  feedback_confirmation_template text default 'Thank you for your feedback! We really appreciate it and will use it to improve. 💙',

  -- Schedule
  review_request_hour integer default 18, -- 6 PM
  review_request_minute integer default 0,
  review_request_enabled boolean default true,

  -- Review URLs
  google_place_id text,
  google_review_url text,
  yelp_business_url text,
  facebook_page_url text,

  -- Alert thresholds
  alert_on_negative boolean default true,
  alert_threshold integer default 3,
  admin_alert_phone text,
  admin_alert_email text,

  -- System settings
  max_retry_attempts integer default 2,
  retry_delay_hours integer default 24
);

-- ─────────────────────────────────────────────────────────────────────────────
-- review_alerts: Track negative reviews that need admin attention
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists review_alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  review_id uuid not null references reviews(id) on delete cascade,
  client_phone text not null,
  client_name text,
  rating integer,
  feedback_text text,
  status text not null default 'pending' check (status in ('pending', 'acknowledged', 'responded', 'resolved')),
  admin_notes text,
  acknowledged_at timestamptz,
  responded_at timestamptz,
  response_message text
);

create index if not exists review_alerts_created_idx on review_alerts (created_at desc);
create index if not exists review_alerts_status_idx on review_alerts (status);
create index if not exists review_alerts_pending_idx on review_alerts (status, created_at desc) where status = 'pending';
create index if not exists review_alerts_review_idx on review_alerts (review_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- review_activity_log: Audit trail for all review system actions
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists review_activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  review_id uuid references reviews(id) on delete set null,
  action text not null, -- 'sent', 'response_received', 'alert_created', 'alert_acknowledged', 'retry_scheduled', 'settings_updated', 'manual_send', etc.
  actor text, -- 'system' or admin username
  details jsonb,
  ip_address text
);

create index if not exists review_activity_log_created_idx on review_activity_log (created_at desc);
create index if not exists review_activity_log_review_idx on review_activity_log (review_id);
create index if not exists review_activity_log_action_idx on review_activity_log (action);
create index if not exists review_activity_log_actor_idx on review_activity_log (actor);
