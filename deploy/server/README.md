# Server Deploy (Persistent Runtime)

Folder source backend tetap di:

`/Users/ryanpratama/Desktop/sales-property-dashboard/apps/server`

Disarankan deploy ke platform yang support process persistent:

1. VPS
2. Railway
3. Render
4. Fly.io

Catatan: mode WhatsApp `qr_local` butuh process yang hidup terus + storage session auth persisten.

## Start Command

Dari root repo:

```bash
pnpm install --frozen-lockfile
pnpm --filter @property-lounge/server build
pnpm --filter @property-lounge/server start
```

## PM2 Runtime (VPS Recommended)

Install PM2:

```bash
npm i -g pm2
```

Install Redis untuk WhatsApp outbound queue:

```bash
sudo apt update
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
redis-cli ping
```

Run dengan PM2 (dari root repo):

```bash
pnpm --filter @property-lounge/server build
pnpm --filter @property-lounge/server pm2:start
pnpm --filter @property-lounge/server pm2:save
```

Setelah menambah kolom `lead_code`, jalankan sekali:

```bash
pnpm db:backfill-lead-codes
```

Script PM2 pakai:

`/Users/ryanpratama/Desktop/sales-property-dashboard/apps/server/ecosystem.config.cjs`

Commands umum:

```bash
pnpm --filter @property-lounge/server pm2:logs
pnpm --filter @property-lounge/server pm2:restart
pnpm --filter @property-lounge/server pm2:stop
pnpm --filter @property-lounge/server pm2:delete
```

## Environment Variables

Gunakan referensi dari file:

`/Users/ryanpratama/Desktop/sales-property-dashboard/deploy/server/.env.example`

Penting untuk mode QR:

1. `WA_PROVIDER=qr_local`
2. `WA_QR_AUTH_PATH=.wa-qr-auth`
3. `WA_PAIRING_PHONE=62812xxxxxxx` (opsional fallback pairing code)
4. `ADMIN_WHATSAPP_TOKEN=` (opsional, untuk lock endpoint admin WhatsApp)
5. `REDIS_URL=redis://127.0.0.1:6379`
6. `WA_QUEUE_ENABLED=true`
