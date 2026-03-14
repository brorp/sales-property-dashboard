import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth";
import { createComponentLogger } from "../utils/logger";

const httpLogger = createComponentLogger("http");

function createRequestId(req: Request) {
    const incoming = req.header("x-request-id");
    if (incoming && incoming.trim()) {
        return incoming.trim();
    }

    return randomUUID().replace(/-/g, "").slice(0, 12);
}

function buildRequestMeta(req: Request, res: Response, durationMs?: number) {
    const authReq = req as AuthenticatedRequest;

    return {
        requestId: authReq.requestId || null,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: durationMs !== undefined ? Number(durationMs.toFixed(1)) : undefined,
        ip: req.ip,
        userId: authReq.user?.id || null,
        userRole: authReq.user?.role || null,
        clientId: authReq.user?.clientId || null,
    };
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
    if (req.path === "/health") {
        next();
        return;
    }

    const requestId = createRequestId(req);
    const startedAt = process.hrtime.bigint();
    let completed = false;

    (req as AuthenticatedRequest).requestId = requestId;
    res.setHeader("x-request-id", requestId);

    httpLogger.debug("Request started", buildRequestMeta(req, res));

    res.on("finish", () => {
        completed = true;
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        const meta = buildRequestMeta(req, res, durationMs);

        if (res.statusCode >= 500) {
            httpLogger.error("Request completed", meta);
            return;
        }

        if (res.statusCode >= 400) {
            httpLogger.warn("Request completed", meta);
            return;
        }

        httpLogger.http("Request completed", meta);
    });

    res.on("close", () => {
        if (completed || res.writableEnded) {
            return;
        }

        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        httpLogger.warn("Request aborted", buildRequestMeta(req, res, durationMs));
    });

    next();
}
