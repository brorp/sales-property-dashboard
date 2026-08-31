import { normalizePhone } from "./phone";

const TRANSIENT_DELIVERY_PATTERNS = [
    "WA_SEND_TIMEOUT",
    "WA_QUEUE_DELIVERY_UNCERTAIN",
    "WA_SESSION_NOT_CONNECTED",
    "WA_WORKSPACE_IDENTITY_MISMATCH",
    "QR WhatsApp client is not connected yet",
    "WhatsApp session identity is not ready",
    "Execution context was destroyed",
    "Protocol error",
    "Target closed",
    "Session closed",
    "Connection closed",
];

export function validateWorkspaceWhatsAppIdentity(params: {
    expectedNumber?: string | null;
    connectedNumber?: string | null;
}) {
    const expectedNumber = params.expectedNumber
        ? normalizePhone(params.expectedNumber)
        : null;
    const connectedNumber = params.connectedNumber
        ? normalizePhone(params.connectedNumber)
        : null;

    if (!expectedNumber) {
        return {
            valid: true as const,
            reason: "not_configured" as const,
            expectedNumber,
            connectedNumber,
        };
    }

    if (!connectedNumber) {
        return {
            valid: false as const,
            reason: "connected_number_missing" as const,
            expectedNumber,
            connectedNumber,
        };
    }

    if (expectedNumber !== connectedNumber) {
        return {
            valid: false as const,
            reason: "number_mismatch" as const,
            expectedNumber,
            connectedNumber,
        };
    }

    return {
        valid: true as const,
        reason: "matched" as const,
        expectedNumber,
        connectedNumber,
    };
}

export function buildWhatsAppQueueReliabilityConfig(params: {
    queueMaxDelayMs: number;
    sendTimeoutMs: number;
    configuredLockDurationMs: number;
    configuredWaitTimeoutMs: number;
}) {
    const safetyMarginMs = 30_000;
    const minimumLockDurationMs = Math.max(
        60_000,
        params.queueMaxDelayMs + params.sendTimeoutMs + safetyMarginMs
    );
    const lockDurationMs = Math.max(
        minimumLockDurationMs,
        params.configuredLockDurationMs
    );
    const waitTimeoutMs = Math.max(
        params.configuredWaitTimeoutMs,
        lockDurationMs + safetyMarginMs
    );

    return {
        lockDurationMs,
        lockRenewTimeMs: Math.max(15_000, Math.floor(lockDurationMs / 3)),
        stalledIntervalMs: Math.max(30_000, Math.floor(lockDurationMs / 2)),
        maxStalledCount: 0,
        waitTimeoutMs,
    };
}

export function isTransientWhatsAppDeliveryFailure(error?: string | null) {
    const message = String(error || "").toLowerCase();
    return TRANSIENT_DELIVERY_PATTERNS.some((pattern) =>
        message.includes(pattern.toLowerCase())
    );
}

export function attemptCountsAsDeliveredOffer(attempt: {
    status: string;
    closeReason?: string | null;
}) {
    return !(
        attempt.status === "closed" &&
        attempt.closeReason === "send_uncertain_transient"
    );
}

export function shouldDisableMissedMessageRecovery(
    consecutiveFailures: number,
    failureThreshold: number
) {
    return failureThreshold > 0 && consecutiveFailures >= failureThreshold;
}

export function isHealthyWhatsAppClientState(state?: string | null) {
    return String(state || "").trim().toUpperCase() === "CONNECTED";
}

export function shouldRecoverWhatsAppHealth(
    consecutiveFailures: number,
    failureThreshold: number
) {
    return failureThreshold > 0 && consecutiveFailures >= failureThreshold;
}

export type WhatsAppRecoverySignal =
    | "browser_disconnected"
    | "browser_page_closed"
    | "health_check_failed"
    | "runtime_navigation_error"
    | "send_timeout"
    | "queue_timeout"
    | "queue_stalled"
    | "scanner_failed";

export function shouldRestartWhatsAppBridge(params: {
    signal: WhatsAppRecoverySignal;
    consecutiveFailures?: number;
    failureThreshold?: number;
}) {
    if (
        params.signal === "browser_disconnected" ||
        params.signal === "browser_page_closed"
    ) {
        return true;
    }

    if (params.signal === "health_check_failed") {
        return shouldRecoverWhatsAppHealth(
            params.consecutiveFailures || 0,
            params.failureThreshold || 0
        );
    }

    // Delivery uncertainty and transient WhatsApp Web navigation errors are
    // handled by the durable outbox/scanner. Restarting a healthy browser here
    // can interrupt an ACK that WhatsApp is still processing.
    return false;
}

export function isWhatsAppBrowserProcessForProfile(
    commandLine: string,
    profilePath: string
) {
    const expectedArgument = `--user-data-dir=${profilePath}`;
    const argumentsList = String(commandLine || "")
        .split("\0")
        .map((value) => value.trim())
        .filter(Boolean);

    return (
        argumentsList.includes(expectedArgument) &&
        !argumentsList.some((value) => value.startsWith("--type="))
    );
}

export function buildWhatsAppReplyMarker(
    leadCode: string,
    replyType: "claim" | "late" | "closed" | "recovery"
) {
    const normalizedLeadCode = String(leadCode || "UNKNOWN")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
    return `[lid] ${normalizedLeadCode || "UNKNOWN"} [${replyType}]`;
}

export function getWhatsAppOutboxRetryDelayMs(attemptCount: number) {
    const normalizedAttempt = Math.max(1, Math.floor(attemptCount || 1));
    return Math.min(5 * 60_000, 15_000 * 2 ** Math.min(normalizedAttempt - 1, 5));
}

export function shouldReconcileWhatsAppOutbox(
    attemptCount: number,
    reconciliationMarker?: string | null
) {
    return attemptCount > 1 && Boolean(String(reconciliationMarker || "").trim());
}
