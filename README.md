# Sales Property Dashboard Monorepo

## Workspace

1. `apps/web` - frontend app.
2. `apps/server` - Express + Drizzle + Better Auth backend.
3. `packages/shared` - shared types/constants.

## Quick Start

```bash
pnpm install
docker compose up -d
pnpm db:push
pnpm db:seed
pnpm dev
```

## Backend Docs

Untuk setup backend detail, akses database, dan testing WhatsApp dummy distribution:

`/Users/ryanpratama/Desktop/sales-property-dashboard/apps/server/README.md`

## Deploy Web ke Vercel (Demo Cepat)

Konfigurasi deploy sudah disiapkan di:

`/Users/ryanpratama/Desktop/sales-property-dashboard/vercel.json`

### Env Variables di Vercel

Untuk versi demo saat ini (data mock/localStorage), **tidak ada env variable wajib**.

Opsional untuk persiapan integrasi backend:

1. `VITE_API_BASE_URL` contoh `https://your-backend-domain.com`

### Langkah Deploy

1. Import repo ini ke Vercel.
2. Framework akan terbaca sebagai Vite (via `vercel.json`).
3. Klik Deploy.
4. Setelah live, login demo:
   - admin: `admin@propertylounge.id` / `admin123`
   - sales: `andi@propertylounge.id` / `sales123`
