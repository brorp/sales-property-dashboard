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

Default `.env` untuk development sudah include:

1. `PROPERTY_LOUNGE_WA=+620000000000`
2. `WHATSAPP_VERIFY_TOKEN=dev-verify-token`
3. `DISTRIBUTION_POLL_MS=15000`
4. `GOOGLE_CALENDAR_MOCK=true` (appointment buat mock event id)

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

## 3) Dummy WhatsApp Test (distribution_cycle)

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
5. `POST /api/leads/:id/assign` (admin)
6. `GET /api/sales`
7. `PATCH /api/sales/:id/queue` (admin)
8. `GET /api/dashboard/stats`

## 5) Catatan Integrasi Frontend TanStack Query

Disarankan bikin custom hooks:

1. `useLeadsQuery`
2. `useLeadDetailQuery`
3. `useUpdateLeadStatusMutation`
4. `useUpdateLeadProgressMutation`
5. `useAssignLeadMutation`
6. `useSalesQuery`
7. `useDashboardStatsQuery`
