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

Deploy dikonfigurasi dari **Vercel Project Settings** (tanpa `vercel.json`).

### Env Variables di Vercel

Untuk versi demo saat ini (data mock/localStorage), **tidak ada env variable wajib**.

Opsional untuk persiapan integrasi backend:

1. `VITE_API_BASE_URL` contoh `https://your-backend-domain.com`

### Langkah Deploy

1. Import repo ini ke Vercel.
2. Set `Root Directory` ke `apps/web`.
3. Build settings:
   - Install Command: `pnpm install --frozen-lockfile`
   - Build Command: `pnpm build`
   - Output Directory: `dist`
4. Klik Deploy.
5. Setelah live, login demo:
   - admin: `admin@propertylounge.id` / `admin123`
   - sales: `andi@propertylounge.id` / `sales123`
