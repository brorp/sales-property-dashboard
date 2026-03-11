import type { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";
import { ApiError, mapDatabaseError } from "../utils/api-error";
import type { AuthenticatedRequest } from "./auth";

/**
 * Global Express error-handling middleware (must have 4 parameters).
 *
 * Handles:
 * 1. ApiError — returns the status code and error code/message
 * 2. Known Postgres/Drizzle DB errors — maps to friendly 400/409 responses
 * 3. Known business-logic error codes thrown as plain Error — maps to 400
 * 4. Everything else — logs and returns 500
 */
export function errorHandler(
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction
) {
    const userId = (req as AuthenticatedRequest).user?.id ?? "anonymous";

    // 1. ApiError — already has status and code
    if (err instanceof ApiError) {
        if (err.statusCode >= 500) {
            logger.error("ApiError (server)", {
                error: err,
                method: req.method,
                url: req.originalUrl,
                userId,
            });
        }
        if (!res.headersSent) {
            res.status(err.statusCode).json({
                error: err.code,
                message: err.message,
            });
        }
        return;
    }

    // 2. Postgres / Drizzle database errors
    const dbError = mapDatabaseError(err);
    if (dbError) {
        logger.warn("Database constraint error", {
            code: dbError.code,
            message: dbError.message,
            method: req.method,
            url: req.originalUrl,
            userId,
        });
        if (!res.headersSent) {
            res.status(dbError.statusCode).json({
                error: dbError.code,
                message: dbError.message,
            });
        }
        return;
    }

    // 3. Plain Error with known business-logic codes
    if (err instanceof Error) {
        const knownBadRequestCodes = new Set([
            // leads
            "FORBIDDEN_ASSIGN",
            "FORBIDDEN_LEAD_EDIT",
            "ADMIN_ASSIGNED_LEAD_READ_ONLY",
            "INVALID_SALES_STATUS",
            "INVALID_RESULT_STATUS",
            "SALES_STATUS_REQUIRES_ASSIGNED",
            "RESULT_STATUS_REQUIRES_SUDAH_SURVEY",
            "CLOSING_FIELDS_REQUIRE_CLOSING_STATUS",
            "CLOSING_FIELDS_REQUIRED",
            "REJECT_REASON_REQUIRES_BATAL_STATUS",
            "REJECT_REASON_REQUIRED",
            // distribution
            "LEAD_NOT_FOUND",
            "LEAD_ALREADY_ASSIGNED",
            "LEAD_NOT_STARTABLE",
            // sales queue
            "INVALID_QUEUE_PAYLOAD",
            "QUEUE_EMPTY",
            "QUEUE_SIZE_MISMATCH",
            "UNKNOWN_SALES_IN_QUEUE",
            // sales user
            "FAILED_TO_CREATE_USER",
            // settings
            "INVALID_DISTRIBUTION_ACK_TIMEOUT",
            "INVALID_OPERATIONAL_TIMEZONE",
            "INVALID_OPERATIONAL_TIME",
            "INVALID_OPERATIONAL_TIME_RANGE",
            "OUTSIDE_OFFICE_REPLY_REQUIRED",
            // broadcast
            "BROADCAST_STATUS_EMPTY",
            "BROADCAST_INTERVAL_INVALID",
            "INVALID_MEDIA_DATA_URL",
            "MEDIA_TYPE_NOT_SUPPORTED",
            "MEDIA_EMPTY",
            "BROADCAST_CONTENT_EMPTY",
            "BROADCAST_NO_TARGET",
        ]);

        const knownConflictCodes = new Set([
            "EMAIL_ALREADY_EXISTS",
            "BROADCAST_ALREADY_RUNNING",
        ]);

        const knownForbiddenCodes = new Set([
            "FORBIDDEN_ASSIGN",
            "FORBIDDEN_LEAD_EDIT",
            "ADMIN_ASSIGNED_LEAD_READ_ONLY",
        ]);

        if (knownForbiddenCodes.has(err.message)) {
            if (!res.headersSent) {
                res.status(403).json({ error: err.message, message: err.message });
            }
            return;
        }

        if (knownConflictCodes.has(err.message)) {
            if (!res.headersSent) {
                res.status(409).json({ error: err.message, message: err.message });
            }
            return;
        }

        if (knownBadRequestCodes.has(err.message)) {
            if (!res.headersSent) {
                res.status(400).json({ error: err.message, message: err.message });
            }
            return;
        }
    }

    // 4. Unknown errors — log full stack and return 500
    logger.error("Unhandled route error", {
        error: err,
        method: req.method,
        url: req.originalUrl,
        userId,
    });

    if (!res.headersSent) {
        res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Internal server error" });
    }
}
