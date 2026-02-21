import "dotenv/config";
import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth";
import apiRoutes from "./routes";
import webhooksRoutes from "./routes/webhooks.routes";
import { startDistributionWorker } from "./worker/distribution.worker";

const app = express();
const PORT = process.env.PORT || 3001;

// CORS
app.use(
    cors({
        origin: process.env.CORS_ORIGIN || "http://localhost:5173",
        credentials: true,
    })
);

// Better Auth handler — must be before express.json() for auth routes
app.all("/api/auth/*splat", toNodeHandler(auth));

// Parse JSON body for API routes
app.use(express.json());

// Public webhook routes (Meta Ads + WhatsApp)
app.use("/webhooks", webhooksRoutes);

// API routes
app.use("/api", apiRoutes);

// Health check
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`🚀 Property Lounge API running on http://localhost:${PORT}`);
    console.log(`📋 Auth:      http://localhost:${PORT}/api/auth`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/api/dashboard`);
    console.log(`👥 Leads:     http://localhost:${PORT}/api/leads`);
    console.log(`👔 Team:      http://localhost:${PORT}/api/team`);
    console.log(`🧭 Sales:     http://localhost:${PORT}/api/sales`);
    console.log(`👤 Profile:   http://localhost:${PORT}/api/profile`);
    console.log(`🔔 Webhooks:  http://localhost:${PORT}/webhooks`);
    startDistributionWorker();
});

export default app;
