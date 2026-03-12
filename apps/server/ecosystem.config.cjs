module.exports = {
    apps: [
        {
            name: "property-lounge-server",
            cwd: __dirname,
            script: "dist/index.js",
            node_args: "--import tsx",
            instances: 1,
            exec_mode: "fork",
            autorestart: true,
            max_restarts: 10,
            env: {
                NODE_ENV: "production",
                WA_PROVIDER: "qr_local",
                WA_QR_AUTH_PATH: ".wa-qr-auth",
                WA_WEBJS_CLIENT_ID: "property-lounge",
                WA_WEBJS_HEADLESS: "true",
                WA_WEBJS_EXECUTABLE_PATH: "/usr/bin/google-chrome-stable", // adjust if chromium path differs
                WA_WEBJS_PUPPETEER_ARGS:
                    "",
            }
        },
    ],
};
