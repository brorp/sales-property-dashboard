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
import {
    createComponentLogger,
    registerGlobalProcessErrorHandlers,
} from "./utils/logger";
import { requestLogger } from "./middleware/request-logger";
import { errorHandler } from "./middleware/error-handler";

const app: ReturnType<typeof express> = express();
const PORT = Number(process.env.PORT || 3001);
const WA_PROVIDER = (process.env.WA_PROVIDER || "dummy").toLowerCase();
const serverLogger = createComponentLogger("server");

app.use(
    cors({
        origin: corsOriginDelegate,
        credentials: true,
    })
);

app.use(requestLogger);
app.all("/api/auth/*splat", toNodeHandler(auth));
app.use(
    express.json({
        limit: process.env.JSON_BODY_LIMIT || "20mb",
    })
);

app.use("/webhooks", webhooksRoutes);
app.use("/api/whatsapp-admin", whatsappAdminRoutes);
app.use("/api/public", publicRoutes);
app.use("/api", apiRoutes);

app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use(errorHandler);

app.listen(PORT, () => {
    const baseUrl = `http://localhost:${PORT}`;

    serverLogger.info("HTTP server started", {
        port: PORT,
        baseUrl,
        waProvider: WA_PROVIDER,
    });

    serverLogger.info("Runtime configuration", {
        authUrl: `${baseUrl}/api/auth`,
        apiBaseUrl: `${baseUrl}/api`,
        webhookBaseUrl: `${baseUrl}/webhooks`,
        whatsappAdminUrl: `${baseUrl}/api/whatsapp-admin/status`,
        corsOrigins: getConfiguredCorsOrigins(),
        corsAllowVercelPreview: getCorsAllowVercelPreview(),
        corsWildcardRootDomains: getCorsWildcardRootDomains(),
        waQrAuthPath: WA_PROVIDER === "qr_local" ? process.env.WA_QR_AUTH_PATH || ".wa-qr-auth" : null,
    });

    startDistributionWorker();
    void startWhatsAppQrBridge();
    registerGlobalProcessErrorHandlers();
});

export default app;
