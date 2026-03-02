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

1. `NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com` (recommended)
2. `NEXT_PUBLIC_ADMIN_WHATSAPP_TOKEN=` (isi kalau backend pakai `ADMIN_WHATSAPP_TOKEN`)

Alternatif kalau mau isi IP/host terpisah:

1. `NEXT_PUBLIC_API_PROTOCOL=https`
2. `NEXT_PUBLIC_API_HOST=123.123.123.123` atau `api.yourdomain.com`
3. `NEXT_PUBLIC_API_PORT=3001` (kosongkan jika pakai 80/443 default)

Catatan:

1. Jika `NEXT_PUBLIC_API_BASE_URL` diisi, variabel `PROTOCOL/HOST/PORT` akan diabaikan.
2. Untuk production sebaiknya tetap pakai domain + HTTPS, bukan IP langsung.
