# FluxPay API

Express + TypeScript backend for FluxPay (airtime, data, electricity, TV, wallet), on **Supabase** (Auth + Postgres).

- **Identity** (passwords, email verification, 6-digit OTPs, sessions) is handled by **Supabase Auth**.
- **App data** (profiles, wallets, ledger, notifications, audit log) is in Supabase **Postgres**, reached only by this API.
- The browser talks to **this API only** — never to Supabase directly. One REST contract: see [docs/API.md](docs/API.md).

## Requirements

Node **22.18+** (it runs the TypeScript source directly — no build step in development).

## 1. Configure Supabase (one time, ~10 minutes)

### a) Authentication settings — Dashboard → Authentication

| Where | Setting |
| --- | --- |
| Sign In / Providers → Email | **Confirm email: ON** (users cannot log in until they enter the code) |
| Sign In / Providers → Email | Minimum password length: 8 |
| Emails → Templates → **Confirm signup** | Replace the body with the OTP version below |
| Emails → Templates → **Reset password** | Replace the body with the OTP version below |
| Emails → SMTP Settings | **Enable custom SMTP** (see below) |
| URL Configuration → **Site URL** | The frontend's login page, e.g. `http://localhost:5175/login` locally, `https://<your-domain>/login` in production |

**Templates must contain `{{ .Token }}`** — that is the 6-digit code. Without it Supabase sends a link instead and the
app's code screens have nothing to type.

Confirm signup — gives both the code and a one-tap button. Either one verifies the account. The button confirms the email
on Supabase's server first and then opens the Site URL, so the account is verified even if that page can't load (for
example `localhost` opened on a phone); the user can then log in normally.

```html
<h2>Verify your FluxPay account</h2>
<p>Enter this code in the FluxPay app:</p>
<h1 style="letter-spacing:6px">{{ .Token }}</h1>
<p>Or confirm with one tap, then log in:</p>
<p><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 24px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold">Confirm my email</a></p>
<p>The code and button expire in 1 hour. If you didn't sign up, ignore this email.</p>
```

Reset password:

```html
<h2>Reset your FluxPay password</h2>
<p>Your password reset code is:</p>
<h1 style="letter-spacing:6px">{{ .Token }}</h1>
<p>It expires in 1 hour. If you didn't request this, ignore this email — your password is unchanged.</p>
```

Also set **Authentication → Sessions / Email OTP expiration** to something short (e.g. 600 seconds) if you want codes to expire sooner than 1 hour.

### b) Custom SMTP (required for real users)

Supabase's built-in mailer is for testing only: **it only delivers to your own project team members and is capped at a
few emails per hour.** Anyone else signing up gets no email. Create a free account at
[Resend](https://resend.com), [Brevo](https://brevo.com) or similar, verify a sending domain, and paste the SMTP
host/port/user/password into Authentication → SMTP Settings.

For Brevo: host `smtp-relay.brevo.com`, port `587`, **username = the full SMTP Login shown on Brevo → SMTP & API → SMTP
(`…@smtp-brevo.com`, not your account email)**, password = an SMTP key (`xsmtpsib-…`, not an API key `xkeysib-…`). The
sender email must be a verified sender in Brevo. A wrong username shows up only as "Error sending confirmation email".

### c) Get your keys

- `SUPABASE_URL`, publishable key, secret key: **Project Settings → API Keys**
- `DATABASE_URL`: the **Connect** button → **Session pooler** string (port 5432). The direct `db.<ref>.supabase.co`
  host is IPv6-only and fails on many networks. Replace `[YOUR-PASSWORD]` with your database password.

## 2. Run it

```bash
npm install
cp .env.example .env        # then fill in the Supabase values (never commit .env)
npm run db:migrate          # creates tables, triggers and row-level security in your Supabase project
npm run dev                 # http://localhost:4000
```

Check `http://localhost:4000/health` → `{"status":"ok","database":"up"}`.

Make yourself an admin (the user must have signed up and verified first):

```bash
npm run promote-admin -- you@example.com
```

## 3. Verify everything works

With the API running, in a second terminal:

```bash
DISABLE_RATE_LIMITS=true npm run dev     # restart the API this way first so the test can run repeatedly
npm run test:e2e
```

~70 checks against your real Supabase project: signup → email verification → login → refresh rotation → password
recovery → single-use reset tokens → PIN set/change/reset → PIN brute-force lockout → wallet funding → every purchase
type → provider failure refund → idempotency → concurrent-spend safety → admin authorization. Test users are created with
throwaway emails and deleted afterwards. OTP codes come from Supabase's admin API (no email is sent), so SMTP delivery
itself is checked manually: sign up with a real address and confirm the email arrives with a 6-digit code.

## How auth works

```
register ─▶ Supabase signUp ─▶ email with 6-digit code ─▶ verify-email ─▶ session (access + refresh tokens)
forgot-password ─▶ email with code ─▶ verify-reset-code ─▶ short-lived single-use resetToken ─▶ reset-password
```

Security properties worth knowing about:

- **No pre-account-hijacking.** Registering an email that exists but is unverified never changes its password; it only
  re-sends the code. Whoever owns the mailbox proves it with the code.
- **Recovery leaves no session.** Verifying a recovery code does not log anyone in; it yields a 10-minute, single-use
  `resetToken`. A password reset ends all existing sessions.
- **Codes are rate-limited per email + IP**, on top of Supabase's own limits.
- **Transaction PIN**: bcrypt-hashed, 5 wrong attempts lock it for 15 minutes (the correct PIN is refused while locked),
  changing it needs the current PIN, and resetting it needs the account password.
- **Database is closed to the internet.** Row-level security is enabled on every table with no policies, and `anon` /
  `authenticated` privileges are revoked, so the public Supabase REST API can read and write nothing. Only this API
  (server-side connection) touches the data.
- **Money safety.** Amounts are integer kobo. Debits are single atomic `UPDATE … WHERE balance >= amount`; every status
  change is a compare-and-set, so webhook retries and the reconciler can never credit or refund twice; idempotency keys
  make client retries safe.
- Unverified signups older than 24 h are deleted automatically (frees the email/phone for the real owner).

## Project layout

```
db/migrations/        SQL schema (applied by npm run db:migrate)
scripts/              migrate, promote-admin, e2e
src/config/env.ts     validated environment
src/db/pool.ts        Postgres pool + transaction helper
src/lib/              supabase clients, audit log, reset tokens
src/middleware/       auth (Supabase token validation), rate limits, validation, errors
src/modules/<name>/   routes → controller → service → repository for auth, users, wallet, transactions,
                      services (airtime/data/electricity/tv), notifications, admin
src/providers/        mock VAS provider + mock payment gateway behind interfaces — swap for real ones here
src/jobs/reconcile.ts refunds stuck payments, expires abandoned funding, deletes stale unverified signups
```

## Still mocked / not built

- **Real VAS provider** (VTpass, Flutterwave Bills, …): implement the `VasProvider` interface in `src/providers/vas`.
  Failure simulation in the mock: any phone/meter/smartcard number ending in `0000`.
- **Real payment gateway** (Paystack, Flutterwave, …): implement `PaymentGateway` in `src/providers/payment`; the
  signed-webhook endpoint and settlement logic already exist. The `mock-*` checkout routes are dev-only (the server
  refuses to boot with them enabled in production).
- **Phone number verification** (SMS OTP): phone is collected and stored but not verified. Needs an SMS provider.
- **Bank withdrawals** (`withdrawal` category exists in the schema; no endpoint yet).

## Deploying

Set `NODE_ENV=production`, a 32+ character `APP_SECRET` and `PAYMENT_WEBHOOK_SECRET`, `CORS_ORIGINS` to your real
frontend origin(s), `TRUST_PROXY=1` behind one proxy/load balancer, and run `npm start`.
