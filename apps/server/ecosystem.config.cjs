// ─────────────────────────────────────────────────────────────────────────────
// PM2 Ecosystem — Multi-Workspace Configuration
//
// ATURAN PER WORKSPACE:
//   name            → unik, format: server-{slug}
//   PORT            → unik per workspace (3001, 3002, dst)
//   WA_ACTIVE_CLIENT_SLUG → slug client di DB (tabel `client`)
//   WA_EXPECTED_NUMBER    → nomor WA yang wajib cocok dengan workspace
//   WA_QR_AUTH_PATH → folder session WA, HARUS BERBEDA antar workspace
//   WA_WEBJS_CLIENT_ID    → ID sesi browser, HARUS BERBEDA antar workspace
//
// Untuk company baru (misal Upperwest di VPS baru):
//   Cukup salin blok workspace di bawah, ganti slug/port/path.
//   1 VPS per company, tiap workspace = 1 entry di sini.
// ─────────────────────────────────────────────────────────────────────────────

const SHARED_WA_ARGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--no-zygote",
].join(",");

const SHARED_BASE = {
    cwd: __dirname,
    script: "dist/index.js",
    node_args: "--import=tsx",
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_restarts: 10,
    min_uptime: "10s",
    watch: false,
    env: {
        NODE_ENV: "production",
        WA_PROVIDER: "qr_local",
        BROADCAST_MIN_INTERVAL_SECONDS: "8",
        BROADCAST_RANDOM_JITTER_SECONDS: "4",
        WA_OUTBOUND_MIN_DELAY_MS: "8000",
        WA_OUTBOUND_RANDOM_JITTER_MS: "4000",
        REDIS_URL: "redis://127.0.0.1:6379",
        WA_QUEUE_ENABLED: "true",
        WA_QUEUE_MIN_DELAY_MS: "5000",
        WA_QUEUE_MAX_DELAY_MS: "20000",
        WA_QUEUE_LOCK_DURATION_MS: "120000",
        WA_QUEUE_WAIT_TIMEOUT_MS: "180000",
        WA_WEBJS_SEND_TIMEOUT_MS: "60000",
        WA_WEBJS_AUTH_TIMEOUT_MS: "120000",
        WA_QR_HEALTHCHECK_MS: "60000",
        WA_QR_HEALTHCHECK_TIMEOUT_MS: "15000",
        WA_QR_HEALTHCHECK_FAILURE_THRESHOLD: "5",
        WA_QR_HEALTH_RECOVERY_COOLDOWN_MS: "600000",
        WA_QR_CLIENT_DESTROY_TIMEOUT_MS: "10000",
        WA_WEBJS_AUTH_FAILURE_RETRY_MS: "60000",
        WA_MISSED_MESSAGE_RECOVERY_INTERVAL_MS: "120000",
        WA_MISSED_RECOVERY_FAILURE_THRESHOLD: "1",
        WA_OUTBOX_POLL_MS: "15000",
        WA_WEBJS_HEADLESS: "true",
        WA_WEBJS_EXECUTABLE_PATH: "/usr/bin/google-chrome-stable",
        WA_WEBJS_PUPPETEER_ARGS: SHARED_WA_ARGS,
    },
};

module.exports = {
    apps: [
        // ── Workspace 1: Widari Residence ──────────────────────────────────
        {
            ...SHARED_BASE,
            name: "server-wr",
            env: {
                ...SHARED_BASE.env,
                PORT: 3001,
                WA_ACTIVE_CLIENT_SLUG: "widari-residence",
                WA_EXPECTED_NUMBER: "+6287810100090",
                WA_QR_AUTH_PATH: ".wa-qr-auth-wr",
                WA_WEBJS_CLIENT_ID: "wa-wr",
                WA_WEBJS_WEB_VERSION: "2.3000.1046375990",
                WA_WEBJS_WEB_VERSION_CACHE_PATH: ".wa-web-cache-wr",
                WA_WEBJS_RUNTIME_PATH: ".wa-runtime-wr",
            },
        },

        // ── Workspace 2: Widari Village ─────────────────────────────────────
        {
            ...SHARED_BASE,
            name: "server-wv",
            env: {
                ...SHARED_BASE.env,
                PORT: 3002,
                WA_ACTIVE_CLIENT_SLUG: "widari-village",
                WA_EXPECTED_NUMBER: "+628131006989",
                WA_QR_AUTH_PATH: ".wa-qr-auth-wv",
                WA_WEBJS_CLIENT_ID: "wa-wv",
                WA_WEBJS_WEB_VERSION: "2.3000.1046388543",
                WA_WEBJS_WEB_VERSION_CACHE_PATH: ".wa-web-cache-wv",
                WA_WEBJS_RUNTIME_PATH: ".wa-runtime-wv",
            },
        },

        // ── Workspace baru (contoh, uncomment jika diperlukan) ──────────────
        // {
        //     ...SHARED_BASE,
        //     name: "server-{slug}",
        //     env: {
        //         ...SHARED_BASE.env,
        //         PORT: 3003,                           // port berikutnya
        //         WA_ACTIVE_CLIENT_SLUG: "{slug}",      // slug di tabel client
        //         WA_EXPECTED_NUMBER: "+62...",        // nomor WA khusus workspace
        //         WA_QR_AUTH_PATH: ".wa-qr-auth-{slug}",
        //         WA_WEBJS_CLIENT_ID: "wa-{slug}",
        //     },
        // },
    ],
};
