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

## 6. Stripe (optional)

1. Create a product + recurring **Price** in [Stripe Dashboard](https://dashboard.stripe.com/).
2. Set **`STRIPE_SECRET_KEY`**, **`STRIPE_PRICE_ID`**, and **`STRIPE_WEBHOOK_SECRET`** (webhook endpoint: `https://YOUR_API/webhooks/stripe`, events e.g. `checkout.session.completed`).
3. The app exposes **`POST /v1/billing/checkout`** (Bearer token) returning a Checkout URL for the logged-in user.

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
| POST | `/v1/billing/checkout` | Bearer (Stripe) |

Share cards are served under **`GET /static/cards/...`** when the model suggests a share card.

---

## Troubleshooting

- **Windows `EPERM` on `prisma generate` (rename `query_engine-windows.dll.node`):** a process still has the Prisma engine DLL open (another `node`/`npm run dev`, the IDE, or real-time antivirus). **End all Node processes** (Task Manager or `taskkill /F /IM node.exe`), then from `backend/`: `Remove-Item -Recurse -Force node_modules\.prisma` and `npx prisma generate`. On Windows you can also run `powershell -File scripts/windows-fix-prisma.ps1` from `backend/`. **`npm run dev`** only runs `prisma generate` when the client is missing or `prisma/schema.prisma` is newer than the generated client, so a normal `npm run dev` does not touch the engine every time and avoids the lock loop.
- **Android cannot connect:** wrong `GLUC_API_BASE`, firewall, or backend not listening on `0.0.0.0` (Express defaults to all interfaces — OK).
- **Prisma errors:** run `npx prisma db push` after Postgres is up.
- **OpenAI errors:** check quota, model access, and `OPENAI_API_KEY`.
- **Telegram 404 on setWebhook:** typo in token or URL must be **HTTPS**.
