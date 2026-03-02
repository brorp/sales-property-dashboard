import "dotenv/config";
import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth/index";
import apiRoutes from "./routes/index";
import webhooksRoutes from "./routes/webhooks.routes";
import whatsappAdminRoutes from "./routes/whatsapp-admin.routes";
import { startDistributionWorker } from "./worker/distribution.worker";
import { startWhatsAppQrBridge } from "./services/whatsapp-qr.service";

const app: ReturnType<typeof express> = express();
const PORT = process.env.PORT || 3001;
const WA_PROVIDER = (process.env.WA_PROVIDER || "dummy").toLowerCase();

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
app.use(
    express.json({
        limit: process.env.JSON_BODY_LIMIT || "20mb",
    })
);

// Public webhook routes (Meta Ads + WhatsApp)
app.use("/webhooks", webhooksRoutes);
app.use("/api/whatsapp-admin", whatsappAdminRoutes);

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
    console.log(`⚙️  WA Admin:  http://localhost:${PORT}/api/whatsapp-admin/status`);
    console.log(`💬 WA Mode:   ${WA_PROVIDER}`);
    if (WA_PROVIDER === "qr_local") {
        console.log(
            `📱 WA QR Auth: ${process.env.WA_QR_AUTH_PATH || ".wa-qr-auth"}`
        );
    }
    startDistributionWorker();
    void startWhatsAppQrBridge();
});

export default app;
