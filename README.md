# Cheyn Payments

Cheyn is a Monero checkout platform with a Next.js dashboard, Convex realtime state, API-key developer routes, and a wallet/settlement worker.

The app supports two payment modes:

- **Hosted mode**: customers pay a platform-controlled subaddress, the worker confirms payment, then sends a payout to the store withdrawal address.
- **View-only mode**: customers pay the merchant wallet directly. The merchant provides a primary address, private view key, and restore height; the worker creates a view-only wallet and verifies incoming payments. The platform cannot spend funds or send payouts in this mode.

## Architecture

```text
Dashboard / Developer API
        -> Next.js App Router API
        -> Convex state
        -> VPS worker
        -> monero-wallet-rpc
        -> Monero daemon
```

Important boundary:

- Vercel/Next.js handles dashboard/API requests and writes intents to Convex.
- The VPS worker is the only process that should provision view-only wallets, scan wallets, send hosted payouts, and deliver webhook retries.
- `monero-wallet-rpc` must never be exposed directly to the browser.

## Main Commands

```bash
npm run dev              # Next.js app
npm run convex:dev       # Convex dev loop
npm run worker           # wallet scanner / payout / webhook worker
npm run lint             # Biome checks
npm run build            # Convex once + Next production build
```

## Environment

Start from `.env.example`.

Core app:

```env
API_BASE_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
CONVEX_URL=...
NEXT_PUBLIC_CONVEX_URL=...
CONVEX_DEPLOY_KEY=...
ADMIN_API_KEY=...
```

Wallet RPC:

```env
MONERO_WALLET_MODE=real
MONERO_RPC_URL=http://your-vps:16482/json_rpc
MONERO_RPC_USER=...
MONERO_RPC_PASS=...
WALLET_BASE_DIR=/home/musti/monero/wallets
WALLET_HOSTED_NAME=hosted_cheyn
WALLET_HOSTED_PASSWORD=...
```

`WALLET_HOSTED_NAME` must be a flat wallet filename under `WALLET_BASE_DIR`. Do not use slashes.

View-only provisioning:

```env
VIEW_KEY_ENCRYPTION_KEY=base64_or_hex_32_byte_key
VIEW_KEY_ENCRYPTION_KEY_VERSION=v1
VIEW_ONLY_PROVISIONING_RETRY_DELAY_MS=60000
VIEW_ONLY_PROVISIONING_MAX_ATTEMPTS=3
```

Generate a valid encryption key with one of:

```bash
openssl rand -base64 32
openssl rand -hex 32
```

## Wallet RPC Setup

For view-only wallet creation, `monero-wallet-rpc` must run with `--wallet-dir`, not `--wallet-file`.

Example systemd service:

```ini
[Unit]
Description=Monero Wallet RPC
After=network.target

[Service]
User=musti
WorkingDirectory=/home/musti/monero

ExecStart=/home/musti/monero-x86_64-linux-gnu-v0.18.4.6/monero-wallet-rpc \
--wallet-dir /home/musti/monero/wallets \
--rpc-bind-ip 0.0.0.0 \
--rpc-bind-port 16482 \
--daemon-address monero.mullvad.net:18081 \
--trusted-daemon \
--rpc-login USER:PASS \
--confirm-external-bind

Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Move the hosted wallet into the wallet dir using a flat name:

```bash
mkdir -p /home/musti/monero/wallets
mv /home/musti/monero/cheyn /home/musti/monero/wallets/hosted_cheyn
mv /home/musti/monero/cheyn.keys /home/musti/monero/wallets/hosted_cheyn.keys
```

Restart services:

```bash
sudo systemctl daemon-reload
sudo systemctl restart monero-rpc.service
sudo systemctl restart cheyn-worker.service
```

## Dashboard Flow

The dashboard supports:

- creating hosted stores
- creating view-only stores
- tracking view-only provisioning progress
- retrying failed view-only provisioning
- creating checkouts
- viewing checkout mode/status
- collecting/inspecting payouts
- testing and retrying webhooks
- deleting stores

Store deletion is a soft delete. The store is marked `deleted` and hidden from the dashboard, while historical checkouts, payouts, and webhook attempts remain available in the database.

## API Overview

Developer API-key routes:

```text
GET    /api/health
POST   /api/v1/devs
POST   /api/v1/stores
PATCH  /api/v1/stores/:storeId
DELETE /api/v1/stores/:storeId
POST   /api/v1/checkouts
GET    /api/v1/checkouts/:checkoutId
POST   /api/v1/webhooks/test
```

Dashboard-authenticated routes:

```text
POST   /api/v1/me/stores
PATCH  /api/v1/me/stores/:storeId
DELETE /api/v1/me/stores/:storeId
POST   /api/v1/me/stores/:storeId/provisioning/retry
POST   /api/v1/me/checkouts
POST   /api/v1/me/payouts/collect
```

Checkout creation accepts exactly one amount style:

```json
{ "amountAtomic": "100000000000", "storeId": "store_..." }
```

```json
{ "amountUsdCents": "2500", "storeId": "store_..." }
```

```json
{ "amount": "25.00", "currency": "USD", "storeId": "store_..." }
```

## Webhooks

Webhook deliveries are signed with HMAC-SHA256 using the store webhook secret and sent in:

```text
x-monero-signature
```

Core events include:

- `payment.confirmed`
- `payment.settled`
- `webhook.test`

Webhook attempts are stored in Convex and retried by the worker with capped retries.

## Worker Responsibilities

`npm run worker` runs the operational loop:

- refresh XMR/USD quotes
- provision queued view-only stores
- retry failed view-only provisioning after cooldown, up to the configured max attempts
- scan hosted wallet transfers
- scan active view-only wallet transfers
- update checkout payment states
- create and process hosted payouts
- mark view-only confirmed payments as settled
- retry due webhooks

View-only provisioning progress is written to Convex:

```text
queued -> validating_store -> decrypting_view_key -> creating_view_only_wallet -> saving_wallet_reference -> ready
```

## Safety Notes

- Do not commit real secrets.
- Rotate any secret pasted into logs, issues, or chat.
- Keep `monero-wallet-rpc` behind a firewall or private network where possible.
- Hosted mode is hot-wallet custody; keep balances small and use payout/manual-review limits.
- View-only mode cannot spend funds, refund automatically, or track outgoing transfers reliably.

## Validation

Before deploying changes:

```bash
npm run lint
npx tsc --noEmit
npm run build
```
