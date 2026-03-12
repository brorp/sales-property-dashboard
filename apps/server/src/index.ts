import "dotenv/config";
import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth/index";
import {
    corsOriginDelegate,
    getConfiguredCorsOrigins,
    getCorsAllowVercelPreview,
    getCorsWildcardRootDomains,
} from "./cors-config";
import apiRoutes from "./routes/index";
import publicRoutes from "./routes/public.routes";
import webhooksRoutes from "./routes/webhooks.routes";
import whatsappAdminRoutes from "./routes/whatsapp-admin.routes";
import { startDistributionWorker } from "./worker/distribution.worker";
import { startWhatsAppQrBridge } from "./services/whatsapp-qr.service";
import { logger } from "./utils/logger";
import { requestLogger } from "./middleware/request-logger";
import { errorHandler } from "./middleware/error-handler";

const app: ReturnType<typeof express> = express();
const PORT = process.env.PORT || 3001;
const WA_PROVIDER = (process.env.WA_PROVIDER || "dummy").toLowerCase();

// CORS
app.use(
    cors({
        origin: corsOriginDelegate,
        credentials: true,
    })
);

// HTTP request logging
app.use(requestLogger);

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
app.use("/api/public", publicRoutes);

// API routes
app.use("/api", apiRoutes);

// Health check
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Global error handler — must be AFTER all routes
app.use(errorHandler);

app.listen(PORT, () => {
    logger.info(`🚀 Property Lounge API running on http://localhost:${PORT}`);
    logger.info(`📋 Auth:      http://localhost:${PORT}/api/auth`);
    logger.info(`📊 Dashboard: http://localhost:${PORT}/api/dashboard`);
    logger.info(`👥 Leads:     http://localhost:${PORT}/api/leads`);
    logger.info(`👔 Team:      http://localhost:${PORT}/api/team`);
    logger.info(`🧭 Sales:     http://localhost:${PORT}/api/sales`);
    logger.info(`👤 Profile:   http://localhost:${PORT}/api/profile`);
    logger.info(`🔔 Webhooks:  http://localhost:${PORT}/webhooks`);
    logger.info(`⚙️  WA Admin:  http://localhost:${PORT}/api/whatsapp-admin/status`);
    logger.info(`💬 WA Mode:   ${WA_PROVIDER}`);
    logger.info(
        `🌐 CORS:      ${getConfiguredCorsOrigins().join(", ")}${getCorsAllowVercelPreview() ? " (+ *.vercel.app)" : ""
        }${getCorsWildcardRootDomains().length > 0 ? ` (+ *.${getCorsWildcardRootDomains().join(", *.")})` : ""}`
    );
    if (WA_PROVIDER === "qr_local") {
        logger.info(
            `📱 WA QR Auth: ${process.env.WA_QR_AUTH_PATH || ".wa-qr-auth"}`
        );
    }
    startDistributionWorker();
    void startWhatsAppQrBridge();
});

export default app;
