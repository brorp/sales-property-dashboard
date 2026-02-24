# Property Lounge Backend (Express + Drizzle + Postgres)

## 1) Jalankan Backend Lokal

```bash
# dari root project
docker compose up -d
pnpm install
pnpm db:push
pnpm db:seed
pnpm dev:server
```

Server default: `http://localhost:3001`

### Opsional: Jalankan dengan PM2 (runtime persisten)

```bash
npm i -g pm2
pnpm --filter @property-lounge/server build
pnpm --filter @property-lounge/server pm2:start
pnpm --filter @property-lounge/server pm2:save
```

Default `.env` untuk development sudah include:

1. `PROPERTY_LOUNGE_WA=+620000000000`
2. `WHATSAPP_VERIFY_TOKEN=dev-verify-token`
3. `DISTRIBUTION_POLL_MS=15000`
4. `GOOGLE_CALENDAR_MOCK=true` (appointment buat mock event id)
5. `WA_PROVIDER=dummy` (`dummy`, `qr_local`, atau `cloud_api`)
6. `WA_QR_AUTH_PATH=.wa-qr-auth` (dipakai kalau `WA_PROVIDER=qr_local`)
7. `WA_CLOUD_API_TOKEN=` (wajib kalau `WA_PROVIDER=cloud_api`)
8. `WA_CLOUD_PHONE_NUMBER_ID=` (wajib kalau `WA_PROVIDER=cloud_api`)
9. `WA_CLOUD_API_VERSION=v21.0`
10. `ADMIN_WHATSAPP_TOKEN=` (opsional, isi untuk mengunci endpoint admin WhatsApp)

## 2) Akses Database

### Opsi A: Drizzle Studio (GUI cepat)

```bash
pnpm db:studio
```

Lalu buka URL yang tampil di terminal.

### Opsi B: psql CLI

```bash
psql postgresql://postgres:postgres@localhost:5433/property_lounge
```

Contoh query:

```sql
-- lihat queue default sales A-F
select sq.queue_order, sq.label, u.name, u.phone
from sales_queue sq
join "user" u on u.id = sq.sales_id
order by sq.queue_order;

-- lihat cycle distribution terakhir
select * from distribution_cycle order by started_at desc limit 5;

-- lihat attempt per lead
select * from distribution_attempt order by assigned_at desc limit 20;

-- lihat log pesan WA
select direction, from_wa, to_wa, body, created_at
from wa_message
order by created_at desc
limit 20;
```

## 3) WhatsApp QR Local Test (tanpa webhook Meta)

### Install dependency dulu

```bash
pnpm install
```

### Set mode provider QR lokal

Di `apps/server/.env`:

```env
WA_PROVIDER=qr_local
WA_QR_AUTH_PATH=.wa-qr-auth
WA_PAIRING_PHONE=62812xxxxxxx
```

### Jalankan server dan scan QR

```bash
pnpm dev:server
```

Saat log `[wa:qr] scan this QR...` muncul, scan dari WhatsApp:

1. WhatsApp di HP
2. `Linked devices`
3. `Link a device`
4. Scan QR terminal

Alternatif: QR bisa ditampilkan di dashboard admin (menu `WhatsApp Settings`) melalui endpoint:

1. `GET /api/whatsapp-admin/status`
2. `POST /api/whatsapp-admin/start`
3. `POST /api/whatsapp-admin/restart`
4. `POST /api/whatsapp-admin/stop`
5. `POST /api/whatsapp-admin/reset`

Jika `ADMIN_WHATSAPP_TOKEN` diisi, kirim header `x-admin-token: <token>`.

Jika QR tidak muncul dan koneksi cepat putus, sistem akan coba cetak pairing code:

1. Pastikan `WA_PAIRING_PHONE` terisi nomor WhatsApp yang akan dilink (format digit, contoh `62812xxxxxxx`)
2. Di WhatsApp buka `Linked devices`
3. Pilih `Link with phone number`
4. Masukkan code yang tampil di terminal

### Flow yang terjadi otomatis

1. Client chat ke nomor WA Property Lounge.
2. Sistem auto-reply:
   `Harap menunggu agent professional akan menhubungi anda`
3. Lead/client masuk dashboard (`lead`, `wa_message`, `distribution_cycle`).
4. Sistem forward detail lead ke Sales A (antrian pertama).
5. Jika Sales A balas `OK` < 5 menit, lead di-claim Sales A.
6. Jika tidak balas, setelah 5 menit pindah ke Sales B, lalu C, dst sampai F.
7. Jika sales balas `OK` tetapi terlambat (>5 menit), sistem kirim notifikasi "terlambat".
8. Jika antrian habis sampai F tanpa `OK`, lead jadi hangus dengan progress `no-action`.

### Catatan nomor sales untuk test

Isi nomor WhatsApp real sales dummy di table `user.phone` (A-F) supaya forward message benar-benar terkirim.

---

## 3.1) Dummy API Test (opsional)

### Data default sales WA dari seed

1. Sales A: `+6281110000001`
2. Sales B: `+6281110000002`
3. Sales C: `+6281110000003`
4. Sales D: `+6281110000004`
5. Sales E: `+6281110000005`
6. Sales F: `+6281110000006`

### Step A - Simulasi lead masuk dari Meta Ads

```bash
curl -X POST http://localhost:3001/webhooks/meta/leads \
  -H "Content-Type: application/json" \
  -d '{
    "metaLeadId": "meta-001",
    "name": "Bapak Test",
    "phone": "081234001234",
    "sourceAds": "Meta Ads CTA - Dummy"
  }'
```

### Step B - Simulasi client chat ke WhatsApp Property Lounge

```bash
curl -X POST http://localhost:3001/webhooks/whatsapp/dummy/client-message \
  -H "Content-Type: application/json" \
  -d '{
    "clientWa": "081234001234",
    "body": "Halo saya tertarik unitnya",
    "clientName": "Bapak Test",
    "sourceAds": "Meta Ads CTA - Dummy"
  }'
```

Saat ini sistem akan:

1. Buat/ambil lead.
2. Start `distribution_cycle`.
3. Assign ke Sales A.
4. Set deadline ACK 5 menit.

### Step C - Sales ACK "OK" (berhasil claim)

```bash
curl -X POST http://localhost:3001/webhooks/whatsapp/dummy/sales-ack \
  -H "Content-Type: application/json" \
  -d '{
    "salesWa": "+6281110000001",
    "body": "OK"
  }'
```

Jika valid dalam 5 menit:

1. Attempt jadi `accepted`.
2. Cycle jadi `accepted`.
3. Lead locked ke sales tersebut.

### Step D - Simulasi timeout rollover (tanpa ACK)

1. Jalankan Step B.
2. Jangan kirim ACK.
3. Tunggu >5 menit (worker auto scan), atau trigger manual:

```bash
curl -X POST http://localhost:3001/webhooks/whatsapp/dummy/run-timeouts
```

Setelah timeout, antrian lanjut ke sales berikutnya (A -> B -> C -> ... -> F).

### Step E - Cek state distribution lead

```bash
curl http://localhost:3001/api/distribution/leads/<LEAD_ID> \
  -b "better-auth.session_token=<token-login>"
```

## 3.2) WhatsApp Cloud API (opsional untuk real send)

Jika ingin kirim pesan real ke nomor sales:

1. Set `WA_PROVIDER=cloud_api`
2. Isi `WA_CLOUD_API_TOKEN`
3. Isi `WA_CLOUD_PHONE_NUMBER_ID`
4. Set webhook Meta ke:
   - Verify URL: `GET /webhooks/whatsapp`
   - Messages URL: `POST /webhooks/whatsapp/messages`

Format payload Cloud API akan diparsing otomatis oleh endpoint `POST /webhooks/whatsapp/messages`.

## 4) Endpoint Penting

### Public webhook

1. `POST /webhooks/meta/leads`
2. `POST /webhooks/whatsapp/messages`
3. `POST /webhooks/whatsapp/dummy/client-message`
4. `POST /webhooks/whatsapp/dummy/sales-ack`
5. `POST /webhooks/whatsapp/dummy/run-timeouts`

### Authenticated API

1. `GET /api/leads`
2. `GET /api/leads/:id`
3. `PATCH /api/leads/:id/status`
4. `PATCH /api/leads/:id/progress`
5. `PATCH /api/leads/:id/layer2` (status layer 2 + rejected reason/note)
6. `POST /api/leads/:id/assign` (admin)
7. `GET /api/sales`
8. `PATCH /api/sales/:id/queue` (admin)
9. `GET /api/dashboard/stats`
10. `GET /api/dashboard/layer2-status-chart` (admin)
11. `GET /api/dashboard/rejected-reason-chart` (admin)

### WhatsApp Admin API (token based)

1. `GET /api/whatsapp-admin/status`
2. `POST /api/whatsapp-admin/start`
3. `POST /api/whatsapp-admin/restart`
4. `POST /api/whatsapp-admin/stop`
5. `POST /api/whatsapp-admin/reset`

## 5) Catatan Integrasi Frontend TanStack Query

Disarankan bikin custom hooks:

1. `useLeadsQuery`
2. `useLeadDetailQuery`
3. `useUpdateLeadStatusMutation`
4. `useUpdateLeadProgressMutation`
5. `useAssignLeadMutation`
6. `useSalesQuery`
7. `useDashboardStatsQuery`
