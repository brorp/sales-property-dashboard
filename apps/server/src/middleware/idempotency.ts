import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedRequest } from "./auth";
import { createComponentLogger } from "../utils/logger";

const idempotencyLogger = createComponentLogger("http:idempotency");
const IDEMPOTENCY_TTL_MS = Math.max(
    5_000,
    Number(process.env.IDEMPOTENCY_TTL_MS || 20_000)
);
const IDEMPOTENCY_PROCESSING_TIMEOUT_MS = Math.max(
    IDEMPOTENCY_TTL_MS,
    Number(process.env.IDEMPOTENCY_PROCESSING_TIMEOUT_MS || 45_000)
);

type CachedResponseType = "json" | "send";

type IdempotencyCacheEntry = {
    status: "processing" | "completed";
    createdAt: number;
    expiresAt: number;
    responseStatus?: number;
    responseBody?: unknown;
    responseType?: CachedResponseType;
    waiters: Array<(entry: IdempotencyCacheEntry | null) => void>;
};

const mutationCache = new Map<string, IdempotencyCacheEntry>();

function isMutationMethod(method: string) {
    const normalized = String(method || "").toUpperCase();
    return normalized === "POST" || normalized === "PATCH" || normalized === "PUT" || normalized === "DELETE";
}

function stableSerialize(value: unknown): string {
    if (value === null) {
        return "null";
    }

    if (value === undefined) {
        return "undefined";
    }

    if (typeof value === "string") {
        return JSON.stringify(value);
    }

    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }

    if (value instanceof Date) {
        return `date:${value.toISOString()}`;
    }

    if (Array.isArray(value)) {
        return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
    }

    if (typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, nestedValue]) => nestedValue !== undefined)
            .sort(([a], [b]) => a.localeCompare(b));
        return `{${entries
            .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableSerialize(nestedValue)}`)
            .join(",")}}`;
    }

    return JSON.stringify(String(value));
}

function cleanupExpiredEntries(now: number) {
    for (const [key, entry] of mutationCache.entries()) {
        if (
            (entry.status === "completed" && entry.expiresAt <= now) ||
            (entry.status === "processing" && entry.createdAt + IDEMPOTENCY_PROCESSING_TIMEOUT_MS <= now)
        ) {
            mutationCache.delete(key);
            for (const resolve of entry.waiters) {
                resolve(null);
            }
        }
    }
}

function buildRequestCacheKey(req: Request) {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id || "anonymous";
    const method = String(req.method || "GET").toUpperCase();
    const path = req.originalUrl || req.path || req.url || "/";
    const providedKey = req.header("x-idempotency-key") || req.header("X-Idempotency-Key");
    const normalizedProvidedKey =
        typeof providedKey === "string" && providedKey.trim() ? providedKey.trim() : "";

    if (normalizedProvidedKey) {
        return `${userId}:${method}:${path}:${normalizedProvidedKey}`;
    }

    return `${userId}:${method}:${path}:body:${stableSerialize(req.body ?? null)}`;
}

function replayCachedResponse(res: Response, entry: IdempotencyCacheEntry) {
    res.setHeader("x-idempotency-replayed", "true");
    const statusCode = entry.responseStatus || 200;

    if (entry.responseType === "send") {
        return res.status(statusCode).send(entry.responseBody as any);
    }

    if (statusCode === 204) {
        return res.status(204).end();
    }

    return res.status(statusCode).json(entry.responseBody);
}

function waitForCompletion(entry: IdempotencyCacheEntry) {
    return new Promise<IdempotencyCacheEntry | null>((resolve) => {
        entry.waiters.push(resolve);
    });
}

function resolveWaiters(entry: IdempotencyCacheEntry | null) {
    if (!entry) {
        return;
    }

    const waiters = [...entry.waiters];
    entry.waiters.length = 0;
    for (const resolve of waiters) {
        resolve(entry);
    }
}

export async function mutationIdempotency(
    req: Request,
    res: Response,
    next: NextFunction
) {
    if (!isMutationMethod(req.method)) {
        next();
        return;
    }

    const now = Date.now();
    cleanupExpiredEntries(now);

    const cacheKey = buildRequestCacheKey(req);
    const existing = mutationCache.get(cacheKey);

    if (existing?.status === "completed" && existing.expiresAt > now) {
        idempotencyLogger.info("Replaying completed mutation response", {
            method: req.method,
            path: req.originalUrl,
        });
        replayCachedResponse(res, existing);
        return;
    }

    if (existing?.status === "processing") {
        idempotencyLogger.info("Waiting for identical mutation already in progress", {
            method: req.method,
            path: req.originalUrl,
        });

        const completedEntry = await waitForCompletion(existing);
        if (
            completedEntry?.status === "completed" &&
            completedEntry.expiresAt > Date.now() &&
            completedEntry.responseType
        ) {
            replayCachedResponse(res, completedEntry);
            return;
        }
    }

    const entry: IdempotencyCacheEntry = {
        status: "processing",
        createdAt: now,
        expiresAt: now + IDEMPOTENCY_TTL_MS,
        waiters: [],
    };
    mutationCache.set(cacheKey, entry);

    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    let responseCaptured = false;

    res.json = ((body: unknown) => {
        responseCaptured = true;
        entry.responseBody = body;
        entry.responseStatus = res.statusCode;
        entry.responseType = "json";
        return originalJson(body);
    }) as Response["json"];

    res.send = ((body?: unknown) => {
        if (!responseCaptured) {
            entry.responseBody = body;
            entry.responseStatus = res.statusCode;
            entry.responseType = "send";
        }
        return originalSend(body as any);
    }) as Response["send"];

    const finalizeEntry = () => {
        if (!mutationCache.has(cacheKey)) {
            return;
        }

        const statusCode = entry.responseStatus || res.statusCode || 0;
        if (statusCode >= 500 || !entry.responseType) {
            mutationCache.delete(cacheKey);
            resolveWaiters(entry);
            return;
        }

        entry.status = "completed";
        entry.expiresAt = Date.now() + IDEMPOTENCY_TTL_MS;
        resolveWaiters(entry);
    };

    res.once("finish", finalizeEntry);
    res.once("close", () => {
        if (!res.writableEnded) {
            mutationCache.delete(cacheKey);
            resolveWaiters(entry);
        }
    });

    next();
}
