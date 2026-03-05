import type { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";
import type { AuthenticatedRequest } from "./auth";

/**
 * Express middleware that logs every HTTP request → response cycle.
 *
 * Captured fields: method, url, status, response-time (ms), userId (if authenticated).
 * Uses the "http" log level so it can be toggled via LOG_LEVEL.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
    // Skip noisy endpoints
    if (req.path === "/health") {
        next();
        return;
    }

    const start = Date.now();

    // Capture when the response finishes
    res.on("finish", () => {
        const duration = Date.now() - start;
        const userId = (req as AuthenticatedRequest).user?.id ?? "anonymous";

        const meta = {
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration: `${duration}ms`,
            userId,
            ip: req.ip,
        };

        if (res.statusCode >= 500) {
            logger.error("Request completed with server error", meta);
        } else if (res.statusCode >= 400) {
            logger.warn("Request completed with client error", meta);
        } else {
            logger.http("Request completed", meta);
        }
    });

    next();
}
