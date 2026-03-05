import type { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";
import type { AuthenticatedRequest } from "./auth";

/**
 * Global Express error-handling middleware (must have 4 parameters).
 *
 * Catches any error that is thrown or passed to `next(err)` but was not
 * handled inside a route-level try/catch. Logs the full stack trace with
 * request context, then returns a consistent 500 JSON response.
 */
export function errorHandler(
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction
) {
    const userId = (req as AuthenticatedRequest).user?.id ?? "anonymous";

    logger.error("Unhandled route error", {
        error: err,
        method: req.method,
        url: req.originalUrl,
        userId,
    });

    if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
    }
}
