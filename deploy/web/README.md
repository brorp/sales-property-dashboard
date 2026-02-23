# Web Deploy (Vercel)

Folder source frontend tetap di:

`/Users/ryanpratama/Desktop/sales-property-dashboard/apps/web`

## Vercel Project Settings

1. Framework: `Next.js`
2. Root Directory: `apps/web`
3. Install Command: `pnpm install --frozen-lockfile`
4. Build Command: `pnpm build`
5. Output Directory: kosongkan (default Next.js)

## Environment Variables

Gunakan referensi dari file:

`/Users/ryanpratama/Desktop/sales-property-dashboard/deploy/web/.env.example`

Minimal:

1. `NEXT_PUBLIC_API_BASE_URL=https://your-backend-domain.com`
2. `NEXT_PUBLIC_ADMIN_WHATSAPP_TOKEN=` (isi kalau backend pakai `ADMIN_WHATSAPP_TOKEN`)
