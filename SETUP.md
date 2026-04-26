# Gluci MVP — setup and end-to-end testing

This repo contains:

- **`backend/`** — Node.js + TypeScript API (Express), Prisma + PostgreSQL, OpenAI, Telegram + WhatsApp webhooks, share-card PNGs.
- **`android/`** — Kotlin + Jetpack Compose app (chat, photo attach, barcode scan, profile goal).

---

## 1. Keys and URLs you need

### Required for core chat (all channels)

| Variable | Where to get it | Used for |
|----------|-----------------|----------|
| **`OPENAI_API_KEY`** | [OpenAI API keys](https://platform.openai.com/api-keys) | LLM + vision (meal photos). |
| **`DATABASE_URL`** | Local Docker, [Neon](https://neon.tech), [Supabase](https://supabase.com), Render Postgres, etc. | Prisma / user data. |
| **`PUBLIC_BASE_URL`** | Your deployed API URL, e.g. `https://gluci-api.onrender.com` | Share-card links, Stripe redirects, webhook registration. |

### Backend `.env` (copy from `backend/.env.example`)

Create **`backend/.env`**:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/gluci?schema=public"
PORT=3000
PUBLIC_BASE_URL=http://localhost:3000

OPENAI_API_KEY=sk-...

FREE_DECISIONS_LIMIT=3

# Telegram (optional until you enable the bot)
TELEGRAM_BOT_TOKEN=

# WhatsApp Cloud API (optional until Meta app is live)
WHATSAPP_VERIFY_TOKEN=choose_a_random_secret_string
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=

# Stripe (optional — paywall checkout)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=

# Daily re-engagement cron (optional)
CRON_SECRET=long_random_string
```

**No separate “Open Food Facts” key** — the MVP uses the public [Open Food Facts API](https://world.openfoodfacts.org/) (barcode lookup).

---

## 2. Run the backend locally

### PostgreSQL

From the repo root:

```powershell
docker compose up -d
```

This matches the sample `DATABASE_URL` above (`postgres` / `postgres`, db `gluci`).

### Install and migrate

```powershell
cd backend
copy .env.example .env
# Edit .env: set OPENAI_API_KEY and DATABASE_URL
npm install
npx prisma db push
npm run dev
```

API: **`http://localhost:3000`**. Health: `GET http://localhost:3000/health`.

**Production (e.g. Render):** set the same env vars, run `npx prisma migrate deploy` (or `db push` for early MVP), start with `npm run build` then `npm start`.

---

## 3. Android Studio — open, configure, run

1. Install [Android Studio](https://developer.android.com/studio) (latest stable).
2. **File → Open** and select the **`android`** folder inside this repo (not the repo root).
3. Wait for Gradle sync. If prompted, accept SDK / JDK 17. If Android Studio asks to **create or update the Gradle Wrapper**, accept (the repo includes `gradle-wrapper.properties`; Studio may still download the wrapper JAR on first sync).
4. **API base URL**
   - **Emulator** talking to backend on your PC: default is already `http://10.0.2.2:3000` in [`android/gradle.properties`](android/gradle.properties) (`GLUC_API_BASE`).
   - **Physical device:** use your PC’s LAN IP, e.g. `http://192.168.1.50:3000`, in `gradle.properties`:
     ```properties
     GLUC_API_BASE=http://192.168.1.50:3000
     ```
     Ensure Windows Firewall allows inbound **port 3000** on private networks.
5. Run **Run → Run 'app'** on an emulator or device.
6. First launch calls **`POST /v1/auth/register`** and stores the token; then you can chat, attach a photo, scan a barcode (camera permission), and set a goal under the profile icon.

---

## 4. Telegram bot

1. Open Telegram, search **`@BotFather`**, run `/newbot`, copy the **HTTP API token**.
2. Put it in **`TELEGRAM_BOT_TOKEN`** in `backend/.env` and restart the API.
3. Set the webhook (replace `YOUR_TOKEN` and `YOUR_PUBLIC_HTTPS_URL`):

   ```text
   https://api.telegram.org/botYOUR_TOKEN/setWebhook?url=YOUR_PUBLIC_HTTPS_URL/webhooks/telegram
   ```

   **Local dev:** use a tunnel ([ngrok](https://ngrok.com), [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/), etc.) so Meta/Telegram can reach your machine:

   ```text
   https://api.telegram.org/botYOUR_TOKEN/setWebhook?url=https://abc123.ngrok.io/webhooks/telegram
   ```

4. Message your bot: send text or a **food photo**. Barcodes can be sent as a numeric message.

---

## 5. WhatsApp (Meta Cloud API)

High level (exact UI changes over time; follow Meta’s current docs):

1. Create a [Meta Developer](https://developers.facebook.com/) app, add **WhatsApp** product.
2. Create a **System User** / get a **permanent access token** with `whatsapp_business_messaging` (and related) permissions.
3. Note **Phone number ID** (WhatsApp → API Setup in the dashboard).
4. In `.env`:
   - **`WHATSAPP_ACCESS_TOKEN`** — token from Meta.
   - **`WHATSAPP_PHONE_NUMBER_ID`** — Phone number ID.
   - **`WHATSAPP_VERIFY_TOKEN`** — any string you choose; must match what you enter in the Meta webhook config.
5. In Meta’s dashboard, set **Callback URL** to:

   `https://YOUR_PUBLIC_DOMAIN/webhooks/whatsapp`

   **Verify token:** same as `WHATSAPP_VERIFY_TOKEN`.

6. Subscribe to **`messages`** (and related) fields for your app.
7. For **local testing**, use a tunnel HTTPS URL as the callback (same idea as Telegram).

**Note:** Outbound marketing/re-engagement on WhatsApp often requires **approved message templates**; the MVP focuses on **inbound** user messages and replies.

---

## 6. Stripe (paywall)

The MVP supports a free-tier limit + recurring subscription via Stripe. The backend creates checkout sessions, manages a customer, listens to webhooks, and exposes a billing portal. The Android app opens checkout in the system browser and refreshes status when it returns.

### 6.1 What you need from Stripe

| Variable | Where in Stripe |
|----------|-----------------|
| **`STRIPE_SECRET_KEY`** | Dashboard → **Developers → API keys** → "Secret key" (`sk_test_...` for test mode, `sk_live_...` for live). |
| **`STRIPE_PRICE_ID`**   | Dashboard → **Products → + Add product** → set name/price → choose **Recurring** (monthly/yearly) → save → open the product → copy the **Price ID** (starts with `price_...`). |
| **`STRIPE_WEBHOOK_SECRET`** | Dashboard → **Developers → Webhooks → + Add endpoint** → URL `{PUBLIC_BASE_URL}/webhooks/stripe`. Events to send: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. After saving, click **Reveal** under "Signing secret" and copy `whsec_...`. |

For Render, paste those 3 values into **Environment** (alongside `DATABASE_URL`, `OPENAI_API_KEY`, `JWT_SECRET`, `PUBLIC_BASE_URL`, `TELEGRAM_BOT_TOKEN`). For local dev, paste them into `backend/.env`.

> **Customer Portal:** before live mode, also enable it in **Stripe Dashboard → Settings → Billing → Customer portal** (one-time toggle). Test mode usually works out of the box.

### 6.2 Local testing with Stripe CLI

If you want to test webhooks locally (without Render), use the [Stripe CLI](https://stripe.com/docs/stripe-cli):

```powershell
stripe login
stripe listen --forward-to http://localhost:3000/webhooks/stripe
```

Use the `whsec_...` it prints as your local **`STRIPE_WEBHOOK_SECRET`**. Then in another terminal:

```powershell
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
```

### 6.3 API surface

| Method | Path | Notes |
|--------|------|-------|
| POST | `/v1/billing/checkout` | Bearer; returns `{ url }` to a Stripe Checkout session. |
| POST | `/v1/billing/portal`   | Bearer; returns `{ url }` to the Stripe Customer Portal (manage / cancel). |
| GET  | `/v1/billing/status`   | Bearer; `{ subscriptionStatus, freeChecksUsed, freeLimit, currentPeriodEnd, cancelAtPeriodEnd, stripeConfigured }`. |
| POST | `/webhooks/stripe`     | Stripe → server. Signed with `STRIPE_WEBHOOK_SECRET`. |

### 6.4 Android UX (built-in)

- **Home top-bar** shows "Free checks X / Y" or "Pro" once active. An **Upgrade** action opens a paywall sheet.
- **Settings (Profile)** shows status + period end + **Upgrade** or **Manage subscription** (opens Stripe Customer Portal in a browser).
- When the backend returns `paywall.checkoutUrl` in a chat reply (free limit hit), the app shows the **paywall bottom sheet** automatically with a "Continue to checkout" button.
- After returning from the browser, the app **auto-refreshes billing status** (Activity onResume).

### 6.5 Verify end-to-end

1. **Backend health:** `GET {PUBLIC_BASE_URL}/health` → `{ "ok": true }`.
2. **Subscription off:** sign in on Android → open **Settings** → status reads `free`. The Home top bar shows free checks count.
3. **Checkout from app:** tap **Upgrade** → Stripe Checkout page opens in the browser. In **test mode**, use card `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP.
4. **Webhook fires:** in **Stripe Dashboard → Developers → Webhooks → your endpoint** you should see `checkout.session.completed` and `customer.subscription.created` events with **200 OK**. Render logs show `gluci-backend` 200 on `/webhooks/stripe`.
5. **Status updates:** return to the app — Settings now shows `active` and a period end date; Home shows **Pro**.
6. **Paywall flow:** in **Stripe Dashboard → Customers**, find the user and **cancel** the test subscription, **or** call the **Manage subscription** button → cancel. Webhook updates `subscriptionStatus`. After it expires, `freeChecksUsed >= FREE_DECISIONS_LIMIT` triggers the paywall on next chat → bottom sheet appears with the checkout URL embedded in the assistant reply (also pushed via `paywall.checkoutUrl` for Telegram/WhatsApp).
7. **Telegram:** when a Telegram user hits the free limit, they get the same upgrade message with the **Stripe Checkout URL** inline. Clicking it in Telegram opens the browser, completes payment, and the next message is unblocked.
8. **Force re-check:** `GET /v1/billing/status` with the user's Bearer token from a tool like `curl` should match what the app shows.

---

## 7. Re-engagement cron (optional)

`GET /internal/cron/reengage` with header:

`x-cron-secret: YOUR_CRON_SECRET`

Processes up to 100 users (Telegram messages if `TELEGRAM_BOT_TOKEN` is set). Schedule this on Render cron, GitHub Actions, etc.

---

## 8. Quick API reference (Android + testing)

| Method | Path | Auth |
|--------|------|------|
| POST | `/v1/auth/signup` | body: `{ "email", "password" }` — returns JWT |
| POST | `/v1/auth/login` | same |
| POST | `/v1/auth/register` | — (legacy device token; optional) |
| GET | `/v1/conversations/` | Bearer |
| POST | `/v1/conversations/` | Bearer — create thread |
| DELETE | `/v1/conversations/:id` | Bearer |
| POST | `/v1/chat/` | Bearer — body includes `conversationId` |
| GET | `/v1/history/?conversationId=` | Bearer |
| PATCH | `/v1/profile/` | Bearer |
| GET | `/v1/summary/daily` | Bearer |
| GET | `/v1/summary/usage` | Bearer |
| GET | `/v1/billing/status` | Bearer (Stripe) |
| POST | `/v1/billing/checkout` | Bearer (Stripe) |
| POST | `/v1/billing/portal` | Bearer (Stripe) |

Share cards are served under **`GET /static/cards/...`** when the model suggests a share card.

---

## Troubleshooting

- **Windows `EPERM` on `prisma generate` (rename `query_engine-windows.dll.node`):** a process still has the Prisma engine DLL open (another `node`/`npm run dev`, the IDE, or real-time antivirus). **End all Node processes** (Task Manager or `taskkill /F /IM node.exe`), then from `backend/`: `Remove-Item -Recurse -Force node_modules\.prisma` and `npx prisma generate`. On Windows you can also run `powershell -File scripts/windows-fix-prisma.ps1` from `backend/`. **`npm run dev`** only runs `prisma generate` when the client is missing or `prisma/schema.prisma` is newer than the generated client, so a normal `npm run dev` does not touch the engine every time and avoids the lock loop.
- **Android cannot connect:** wrong `GLUC_API_BASE`, firewall, or backend not listening on `0.0.0.0` (Express defaults to all interfaces — OK).
- **Prisma errors:** run `npx prisma db push` after Postgres is up.
- **OpenAI errors:** check quota, model access, and `OPENAI_API_KEY`.
- **Telegram 404 on setWebhook:** typo in token or URL must be **HTTPS**.
