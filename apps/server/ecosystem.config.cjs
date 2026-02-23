module.exports = {
    apps: [
        {
            name: "property-lounge-server",
            cwd: __dirname,
            script: "dist/index.js",
            instances: 1,
            exec_mode: "fork",
            autorestart: true,
            max_restarts: 10,
            env: {
                NODE_ENV: "production",
            },
        },
    ],
};
