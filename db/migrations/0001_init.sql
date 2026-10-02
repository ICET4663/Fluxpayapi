-- FluxPay application schema for Supabase Postgres.
--
-- Identity (passwords, email verification, OTP codes, sessions) lives in Supabase Auth (auth.users).
-- Everything here is application data. It is only ever read/written by the Express API over a
-- server-side database connection; the browser never talks to these tables directly.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per Supabase Auth user
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  full_name           text        not null,
  email               text        not null,
  phone               text,
  role                text        not null default 'user' check (role in ('user', 'admin')),
  pin_hash            text,
  pin_failed_attempts integer     not null default 0,
  pin_locked_until    timestamptz,
  biometric_enabled   boolean     not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists profiles_email_key on public.profiles (lower(email));
create unique index if not exists profiles_phone_key on public.profiles (phone) where phone is not null;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- wallets: one per user, balance stored in kobo (1 NGN = 100 kobo) as an integer
-- ---------------------------------------------------------------------------

create table if not exists public.wallets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null unique references public.profiles (id) on delete cascade,
  balance_kobo bigint      not null default 0 check (balance_kobo >= 0),
  currency     text        not null default 'NGN',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists wallets_set_updated_at on public.wallets;
create trigger wallets_set_updated_at
  before update on public.wallets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- transactions: the ledger. Financial records are never cascade-deleted with a user.
-- ---------------------------------------------------------------------------

create table if not exists public.transactions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid        not null references public.profiles (id),
  wallet_id          uuid        not null references public.wallets (id),
  reference          text        not null unique,
  idempotency_key    text,
  type               text        not null check (type in ('credit', 'debit')),
  category           text        not null check (category in ('airtime', 'data', 'electricity', 'tv', 'wallet_funding', 'withdrawal')),
  title              text        not null,
  subtitle           text,
  amount_kobo        bigint      not null check (amount_kobo > 0),
  fee_kobo           bigint      not null default 0 check (fee_kobo >= 0),
  status             text        not null check (status in ('pending', 'processing', 'successful', 'failed', 'reversed')),
  provider           text,
  provider_reference text,
  metadata           jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- A client retrying with the same idempotency key must never create a second charge.
create unique index if not exists transactions_user_idempotency_key
  on public.transactions (user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists transactions_user_created_idx on public.transactions (user_id, created_at desc);
create index if not exists transactions_status_created_idx on public.transactions (status, created_at);

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- notifications: in-app notification feed (the bell icon)
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  type       text        not null,
  title      text        not null,
  body       text        not null,
  metadata   jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications (user_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- audit_logs: security-relevant events (logins, PIN changes, money movement)
-- ---------------------------------------------------------------------------

create table if not exists public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles (id) on delete set null,
  action     text        not null,
  ip         text,
  metadata   jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_user_created_idx on public.audit_logs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- consumed_tokens: single-use enforcement for password-reset tokens (keyed by the token's jti)
-- ---------------------------------------------------------------------------

create table if not exists public.consumed_tokens (
  jti        text primary key,
  expires_at timestamptz not null
);


-- ---------------------------------------------------------------------------
-- New Supabase Auth user -> profile + wallet
-- Runs for every sign-up path (API register, dashboard invite, admin API), so a user can never
-- exist without a profile and a wallet. Name and phone arrive through the signUp user metadata.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'phone'), '')
  );

  insert into public.wallets (user_id) values (new.id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row level security
-- Supabase exposes the public schema through its REST API using the anon key, which ships in every
-- frontend bundle. RLS on with no policies means that API can read and write nothing here. The
-- Express API connects with the database owner role, which bypasses RLS by design.
-- ---------------------------------------------------------------------------

alter table public.profiles      enable row level security;
alter table public.wallets       enable row level security;
alter table public.transactions  enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs    enable row level security;
alter table public.consumed_tokens enable row level security;

revoke all on public.profiles      from anon, authenticated;
revoke all on public.wallets       from anon, authenticated;
revoke all on public.transactions  from anon, authenticated;
revoke all on public.notifications from anon, authenticated;
revoke all on public.audit_logs    from anon, authenticated;
revoke all on public.consumed_tokens from anon, authenticated;
