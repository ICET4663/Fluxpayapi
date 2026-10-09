# FluxPay API reference

Base URL (dev): `http://localhost:4000`. All bodies are JSON. Amounts are **naira** (numbers) in requests and responses;
the database stores kobo internally.

## Conventions

**Auth header:** `Authorization: Bearer <accessToken>` on everything marked 🔒.

**Errors** always look like:

```json
{ "error": { "code": "invalid_code", "message": "That code is incorrect or has expired. Request a new one.", "details": null } }
```

`details` carries zod field errors for `400 bad_request` validation failures (`details.fieldErrors.<field>[]`).

| Status | `code` | Meaning |
| --- | --- | --- |
| 400 | `bad_request` | Validation failed / bad input |
| 400 | `invalid_code` | OTP wrong or expired |
| 400 | `insufficient_funds` | Wallet balance too low |
| 401 | `invalid_token` | Missing/expired/revoked access token → refresh once, then send to login |
| 401 | `unauthorized` | Wrong email/password or wrong current password |
| 401 | `incorrect_pin` | Wrong transaction PIN (message says attempts left) |
| 403 | `email_not_verified` | Login attempted before the email code was entered → send user to the verify screen |
| 403 | `forbidden` | Not allowed (e.g. no PIN set yet, not an admin) |
| 409 | `conflict` | Email or phone already registered |
| 423 | `pin_locked` | Too many wrong PINs; locked 15 min |
| 429 | `too_many_requests` | Rate limited |
| 502 | `email_not_deliverable` / `auth_provider_error` | Email provider problem (see README: custom SMTP) |

**Sessions:** `tokens = { accessToken, refreshToken, expiresAt (unix seconds), expiresIn (seconds) }`. Access tokens are
short-lived; call `/api/auth/refresh` before/after expiry. **Refresh tokens rotate** — every refresh returns a new
refresh token and the old one stops working, so only ever keep the latest, and never run two refreshes concurrently
(single-flight them in the client).

`user` = `{ id, fullName, email, phone, role: "user"|"admin", hasPin, emailVerified, biometricEnabled, createdAt }`

---

## Auth (public)

### Sign-up flow

1. `POST /api/auth/register` `{ fullName, email, phone, password }` — phone `0XXXXXXXXXX` or `+234XXXXXXXXXX`; password 8–72 chars.
   → `201 { message, email, verificationRequired: true }`. A 6-digit code is emailed. No session yet.
   - Email already verified → `409`. Email registered but **unverified** → code is re-sent (password is *not* changed).
2. `POST /api/auth/verify-email` `{ email, code }` → `200 { user, tokens }` — the user is now logged in.
   - Wrong/expired code → `400 invalid_code`.
3. `POST /api/auth/resend-verification` `{ email }` → `200` (always, to avoid revealing which emails exist). Throttle the button client-side (60 s).

### Login / session

- `POST /api/auth/login` `{ email, password }` → `200 { user, tokens }`. `401` bad credentials; `403 email_not_verified` → route to the verify screen (call `resend-verification` first).
- `POST /api/auth/refresh` `{ refreshToken }` → `200 { tokens }`. `401` ⇒ session is dead, send the user to login.
- 🔒 `POST /api/auth/logout` → `204`. Ends this device's session.

### Forgot password (3 steps)

1. `POST /api/auth/forgot-password` `{ email }` → `200` (always). Emails a 6-digit code.
2. `POST /api/auth/verify-reset-code` `{ email, code }` → `200 { resetToken }` (valid 10 min, single use). Does **not** log the user in.
3. `POST /api/auth/reset-password` `{ resetToken, newPassword }` → `200`. All sessions are ended; send the user to login.
   Weak password → `400` and the same `resetToken` can be retried.

Rate limits: 5 sends / 10 code-checks per email+IP per 15 min; 10 logins per email+IP per 15 min.

---

## Users 🔒

| Method & path | Body | Result |
| --- | --- | --- |
| `GET /api/users/me` | | `{ user }` |
| `PATCH /api/users/me` | `{ fullName? }` | `{ user }` |
| `POST /api/users/me/pin` | first time: `{ pin }` · change: `{ pin, currentPin }` | `{ message }` |
| `POST /api/users/me/pin/verify` | `{ pin }` | `{ valid: true }` (counts toward lockout) |
| `POST /api/users/me/pin/reset` | `{ password, pin }` — forgot-PIN, proves ownership with the account password | `{ message }` |
| `POST /api/users/me/biometric` | `{ enabled }` | `{ message }` |
| `POST /api/users/me/password` | `{ currentPassword, newPassword }` | `{ message }` (other devices are signed out) |

PIN is exactly 4 digits.

## Wallet 🔒

- `GET /api/wallet` → `{ wallet: { balance, currency } }`
- `POST /api/wallet/fund/initialize` `{ amount }` (≤ 1,000,000) → `201 { funding: { reference, authorizationUrl, accessCode } }`
- Dev only (`ENABLE_MOCK_PAYMENTS=true`): `POST /api/wallet/fund/mock-complete` `{ reference, outcome: "success"|"failed" }` → `{ transaction }`. Stands in for the payment page; owner-only.
- `POST /api/wallet/fund/verify` `{ reference }` → `{ transaction }`. Call when the user returns from checkout (Paystack redirects to `<frontend>/dashboard/wallet?reference=...`). Asks the gateway for the final state and credits the wallet if paid; harmless to repeat.
- `POST /api/wallet/fund/webhook` — for the payment gateway (HMAC signature header: `x-paystack-signature` for Paystack, `x-webhook-signature` for the mock), not the frontend. Point Paystack's dashboard webhook URL at `https://<api-host>/api/wallet/fund/webhook`.

With `PAYMENT_PROVIDER=paystack`, `authorizationUrl` is Paystack's hosted checkout: redirect the browser to it.

## Services

- `GET /api/services/catalog` (public) → `{ networks, dataPlans, discos, electricityFee, tvProviders, tvPackages }`
- 🔒 All purchases take `pin` (4 digits) and an optional `idempotencyKey` (string ≥ 6 chars — **generate one per attempt
  on the client and reuse it when retrying**, so a flaky network never charges twice). All return
  `201 { transaction }`; check `transaction.status` (`successful` | `failed` — failed means the wallet was refunded | `processing` — still being confirmed, poll `GET /api/transactions/:reference`).

| Path | Body |
| --- | --- |
| `POST /api/services/airtime` | `{ network, phone, amount, pin, idempotencyKey? }` — amount ₦50–50,000 |
| `POST /api/services/data` | `{ network, phone, planId, pin, idempotencyKey? }` |
| `POST /api/services/electricity` | `{ discoId, meterNumber, meterType: "prepaid"\|"postpaid", amount, pin, idempotencyKey? }` — ₦1,000–500,000 + ₦100 fee |
| `POST /api/services/tv` | `{ provider, smartCardNumber, packageId, pin, idempotencyKey? }` |
| `POST /api/services/electricity/validate` | `{ discoId, meterNumber, meterType }` → `{ lookup: { valid, customerName?, message? } }` |
| `POST /api/services/tv/validate` | `{ provider, smartCardNumber }` → `{ lookup }` |

`network`: `mtn` `airtel` `glo` `9mobile` · `provider`: `dstv` `gotv` `startimes`. Mock provider: numbers ending `0000` fail.

## Transactions 🔒

- `GET /api/transactions?type=credit|debit&category=airtime|data|electricity|tv|wallet_funding&limit=20&offset=0` → `{ transactions, total, limit, offset }`
- `GET /api/transactions/:reference` → `{ transaction }`
- `GET /api/transactions/summary?month=2026-10` (month optional, defaults to now, Lagos time) → `{ summary: { month, label, totalSpent, previousMonthSpent, changePercent, dailyAverage, weeks: [{label:"W1",amount}…5], byCategory: [{category, amount}] } }`. Only completed bill payments count (airtime, data, electricity, tv). `changePercent` is null when last month had no spending.

`transaction` = `{ id, reference, title, subtitle, amount, fee, type, category, status, createdAt }`

## Banking / withdrawals 🔒

- `GET /api/banking/banks` → `{ banks: [{ code, name }], fee, min, max }` (fee ₦50 per withdrawal; ₦100–500,000)
- `POST /api/banking/resolve` `{ bankCode, accountNumber }` → `{ accountName }`. Show the name so the user confirms it before sending. `400` if the account does not exist.
- `POST /api/banking/withdraw` `{ bankCode, accountNumber (10 digits), amount, pin, idempotencyKey? }` → `201 { transaction }`. The wallet is debited `amount + fee` up front. `status`: `successful`, `failed` (refunded), or `processing` (the bank transfer is still settling; poll `GET /api/transactions/:reference`, it can take a few minutes).

## Notifications 🔒

- `GET /api/notifications?limit=30&offset=0` → `{ notifications: [{ id, type, title, body, metadata, read, createdAt }], total, unread }`
- `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`

## Admin 🔒 (role `admin`)

`GET /api/admin/stats` · `GET /api/admin/users?search=&limit=&offset=` · `GET /api/admin/transactions?status=&category=&search=` · `GET /api/admin/audit-logs` · `GET /api/admin/reconciliation` (do wallet balances match the ledger? `balanced: false` lists the offending wallets)

Make a user admin: `npm run promote-admin -- email@example.com`.
