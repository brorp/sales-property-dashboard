import { Queue, QueueEvents, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { normalizePhone } from "../utils/phone";
import { createComponentLogger } from "../utils/logger";
import {
    recoverWhatsAppQrBridge,
    sendWhatsAppQrMedia,
    sendWhatsAppQrText,
} from "./whatsapp-qr.service";
import { buildWhatsAppQueueReliabilityConfig } from "../utils/whatsapp-runtime";

const waProviderLogger = createComponentLogger("wa:provider");
const waQueueLogger = createComponentLogger("wa:queue");

type WaProvider = "dummy" | "cloud_api" | "qr_local";

type SendResult = {
    sent: boolean;
    provider: WaProvider;
    providerMessageId?: string;
    error?: string;
    errorCode?: string;
};

type TextJobData = {
    kind: "text";
    to: string;
    body: string;
    scopeKey: string;
};

type MediaJobData = {
    kind: "media";
    to: string;
    body?: string;
    mediaBase64: string;
    mimeType: string;
    fileName?: string;
    scopeKey: string;
};

type OutboundJobData = TextJobData | MediaJobData;

let outboundSendChain: Promise<void> = Promise.resolve();
let lastOutboundSentAt = 0;
let redisConnection: IORedis | null = null;
let queueConnection: IORedis | null = null;
let queueEventsConnection: IORedis | null = null;
let outboundQueue: Queue<OutboundJobData, SendResult> | null = null;
let outboundQueueEvents: QueueEvents | null = null;
let outboundWorker: Worker<OutboundJobData, SendResult> | null = null;

function currentProvider(): WaProvider {
    const provider = (process.env.WA_PROVIDER || "dummy").toLowerCase();
    if (provider === "qr_local" || provider === "cloud_api") {
        return provider;
    }
    return "dummy";
}

function toWhatsAppRecipient(input: string) {
    const normalized = normalizePhone(input);
    return normalized.replace(/[^\d]/g, "");
}

function previewBody(body: string) {
    const trimmed = String(body || "").trim();
    if (!trimmed) {
        return "";
    }

    return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveIntEnv(raw: string | undefined, fallback: number) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return fallback;
    }
    return Math.floor(parsed);
}

function getRedisUrl() {
    return process.env.REDIS_URL || process.env.WA_QUEUE_REDIS_URL || "";
}

function isQueueEnabled() {
    const raw = String(process.env.WA_QUEUE_ENABLED || "").toLowerCase();
    if (raw === "false" || raw === "0" || raw === "off") {
        return false;
    }
    return Boolean(getRedisUrl()) || raw === "true" || raw === "1" || raw === "on";
}

function queueName() {
    return (process.env.WA_QUEUE_NAME || `wa-outbound-${getOutboundScopeKey()}`).replace(/:/g, "_");
}

function getOutboundScopeKey() {
    return (
        process.env.WA_ACTIVE_CLIENT_SLUG ||
        process.env.WA_CLOUD_PHONE_NUMBER_ID ||
        process.env.WA_QR_AUTH_PATH ||
        "default"
    ).replace(/[^a-zA-Z0-9:_-]/g, "_");
}

function createRedisConnection(
    label: string,
    options: {
        maxRetriesPerRequest: number | null;
        enableOfflineQueue: boolean;
    } = {
        maxRetriesPerRequest: null,
        enableOfflineQueue: true,
    }
) {
    const redisUrl = getRedisUrl();
    if (!redisUrl) {
        throw new Error("REDIS_URL is required when WA queue is enabled");
    }

    const connection = new IORedis(redisUrl, {
        maxRetriesPerRequest: options.maxRetriesPerRequest,
        enableReadyCheck: false,
        enableOfflineQueue: options.enableOfflineQueue,
    });
    connection.on("error", (error) => {
        waQueueLogger.error("Redis connection error", { label, error });
    });
    return connection;
}

function getRedisConnection() {
    if (!redisConnection) {
        redisConnection = createRedisConnection("worker");
    }
    return redisConnection;
}

function getQueueConnection() {
    if (!queueConnection) {
        queueConnection = createRedisConnection("queue", {
            maxRetriesPerRequest: null,
            enableOfflineQueue: false,
        });
    }
    return queueConnection;
}

function getQueueEventsConnection() {
    if (!queueEventsConnection) {
        queueEventsConnection = createRedisConnection("events", {
            maxRetriesPerRequest: null,
            enableOfflineQueue: false,
        });
    }
    return queueEventsConnection;
}

function getOutboundQueue() {
    if (!outboundQueue) {
        outboundQueue = new Queue<OutboundJobData, SendResult>(queueName(), {
            connection: getQueueConnection(),
            defaultJobOptions: {
                attempts: parsePositiveIntEnv(process.env.WA_QUEUE_ATTEMPTS, 1),
                backoff: {
                    type: "exponential",
                    delay: parsePositiveIntEnv(process.env.WA_QUEUE_RETRY_DELAY_MS, 30_000),
                },
                removeOnComplete: {
                    age: parsePositiveIntEnv(process.env.WA_QUEUE_REMOVE_COMPLETE_AGE_SEC, 86_400),
                    count: parsePositiveIntEnv(process.env.WA_QUEUE_REMOVE_COMPLETE_COUNT, 1_000),
                },
                removeOnFail: {
                    age: parsePositiveIntEnv(process.env.WA_QUEUE_REMOVE_FAIL_AGE_SEC, 604_800),
                    count: parsePositiveIntEnv(process.env.WA_QUEUE_REMOVE_FAIL_COUNT, 5_000),
                },
            },
        });
    }
    return outboundQueue;
}

function getOutboundQueueEvents() {
    if (!outboundQueueEvents) {
        outboundQueueEvents = new QueueEvents(queueName(), {
            connection: getQueueEventsConnection(),
        });
    }
    return outboundQueueEvents;
}

function getOutboundThrottleConfig(provider: string) {
    if (provider === "dummy") {
        return {
            minDelayMs: 0,
            jitterMs: 0,
        };
    }

    return {
        minDelayMs: parsePositiveIntEnv(process.env.WA_OUTBOUND_MIN_DELAY_MS, 8_000),
        jitterMs: parsePositiveIntEnv(process.env.WA_OUTBOUND_RANDOM_JITTER_MS, 4_000),
    };
}

function getQueueDelayConfig(provider: string) {
    if (provider === "dummy") {
        return {
            minDelayMs: 0,
            maxDelayMs: 0,
        };
    }

    const minDelayMs = parsePositiveIntEnv(
        process.env.WA_QUEUE_MIN_DELAY_MS || process.env.WA_OUTBOUND_MIN_DELAY_MS,
        8_000
    );
    const maxDelayMs = parsePositiveIntEnv(
        process.env.WA_QUEUE_MAX_DELAY_MS,
        Math.max(minDelayMs, 25_000)
    );

    return {
        minDelayMs,
        maxDelayMs: Math.max(minDelayMs, maxDelayMs),
    };
}

function getQueueReliabilityConfig() {
    const queueDelay = getQueueDelayConfig(currentProvider());
    return buildWhatsAppQueueReliabilityConfig({
        queueMaxDelayMs: queueDelay.maxDelayMs,
        sendTimeoutMs: parsePositiveIntEnv(process.env.WA_WEBJS_SEND_TIMEOUT_MS, 60_000),
        configuredLockDurationMs: parsePositiveIntEnv(
            process.env.WA_QUEUE_LOCK_DURATION_MS,
            120_000
        ),
        configuredWaitTimeoutMs: parsePositiveIntEnv(
            process.env.WA_QUEUE_WAIT_TIMEOUT_MS,
            180_000
        ),
    });
}

async function applyQueueDelay(provider: WaProvider, job: Job<OutboundJobData, SendResult>) {
    const { minDelayMs, maxDelayMs } = getQueueDelayConfig(provider);
    if (minDelayMs <= 0 && maxDelayMs <= 0) {
        return;
    }

    const delayRange = Math.max(0, maxDelayMs - minDelayMs);
    const waitMs = minDelayMs + (delayRange > 0 ? Math.floor(Math.random() * (delayRange + 1)) : 0);
    if (waitMs <= 0) {
        return;
    }

    waQueueLogger.info("Applying WhatsApp queue delay", {
        jobId: job.id,
        provider,
        scopeKey: job.data.scopeKey,
        kind: job.data.kind,
        waitMs,
        minDelayMs,
        maxDelayMs,
    });
    await sleep(waitMs);
}

async function runWithOutboundThrottle<T>(
    provider: string,
    meta: { to: string; kind: "text" | "media" },
    task: () => Promise<T>
) {
    const { minDelayMs, jitterMs } = getOutboundThrottleConfig(provider);

    if (minDelayMs <= 0 && jitterMs <= 0) {
        return task();
    }

    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const previous = outboundSendChain;
    outboundSendChain = previous.finally(() => gate);

    await previous;

    try {
        const now = Date.now();
        const earliestNextSendAt = lastOutboundSentAt + minDelayMs;
        const baseWaitMs = Math.max(0, earliestNextSendAt - now);
        const jitterWaitMs = jitterMs > 0 ? Math.floor(Math.random() * (jitterMs + 1)) : 0;
        const totalWaitMs = baseWaitMs + jitterWaitMs;

        if (totalWaitMs > 0) {
            waProviderLogger.info("Applying WhatsApp outbound throttle", {
                provider,
                to: meta.to,
                kind: meta.kind,
                waitMs: totalWaitMs,
                minDelayMs,
                jitterMs,
            });
            await sleep(totalWaitMs);
        }

        const result = await task();
        lastOutboundSentAt = Date.now();
        return result;
    } finally {
        release();
    }
}

async function sendWhatsAppTextRaw(
    to: string,
    body: string,
    provider = currentProvider()
): Promise<SendResult> {
    if (provider === "qr_local") {
        return sendWhatsAppQrText(to, body);
    }

    if (provider !== "cloud_api") {
        waProviderLogger.info("Dummy WhatsApp text send simulated", {
            to,
            bodyPreview: previewBody(body),
        });
        return { sent: true, provider: "dummy" };
    }

    const token = process.env.WA_CLOUD_API_TOKEN;
    const phoneNumberId = process.env.WA_CLOUD_PHONE_NUMBER_ID;
    const version = process.env.WA_CLOUD_API_VERSION || "v21.0";

    if (!token || !phoneNumberId) {
        return {
            sent: false,
            provider: "cloud_api",
            error: "Missing WA_CLOUD_API_TOKEN or WA_CLOUD_PHONE_NUMBER_ID",
        };
    }

    const recipient = toWhatsAppRecipient(to);
    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: recipient,
                type: "text",
                text: {
                    preview_url: false,
                    body,
                },
            }),
        });

        const data = (await response.json()) as any;
        if (!response.ok) {
            return {
                sent: false,
                provider: "cloud_api",
                error: data?.error?.message || `HTTP ${response.status}`,
            };
        }

        return {
            sent: true,
            provider: "cloud_api",
            providerMessageId: data?.messages?.[0]?.id,
        };
    } catch (error) {
        return {
            sent: false,
            provider: "cloud_api",
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

async function sendWhatsAppMediaRaw(params: {
    to: string;
    body?: string;
    mediaBuffer: Buffer;
    mimeType: string;
    fileName?: string;
}, provider = currentProvider()): Promise<SendResult> {
    if (provider === "qr_local") {
        return sendWhatsAppQrMedia(params);
    }

    if (provider !== "cloud_api") {
        waProviderLogger.info("Dummy WhatsApp media send simulated", {
            to: params.to,
            mimeType: params.mimeType,
            fileName: params.fileName || null,
            bodyPreview: previewBody(params.body || ""),
        });
        return { sent: true, provider: "dummy" };
    }

    return {
        sent: false,
        provider: "cloud_api",
        error: "Cloud API media broadcast is not supported in this build",
    };
}

async function sendWhatsAppTextDirect(to: string, body: string): Promise<SendResult> {
    const provider = currentProvider();
    return runWithOutboundThrottle(provider, { to, kind: "text" }, () =>
        sendWhatsAppTextRaw(to, body, provider)
    );
}

async function sendWhatsAppMediaDirect(params: {
    to: string;
    body?: string;
    mediaBuffer: Buffer;
    mimeType: string;
    fileName?: string;
}): Promise<SendResult> {
    const provider = currentProvider();
    return runWithOutboundThrottle(provider, { to: params.to, kind: "media" }, () =>
        sendWhatsAppMediaRaw(params, provider)
    );
}

async function processOutboundJob(job: Job<OutboundJobData, SendResult>) {
    const provider = currentProvider();
    await applyQueueDelay(provider, job);

    if (job.data.kind === "text") {
        return sendWhatsAppTextRaw(job.data.to, job.data.body, provider);
    }

    return sendWhatsAppMediaRaw(
        {
            to: job.data.to,
            body: job.data.body,
            mediaBuffer: Buffer.from(job.data.mediaBase64, "base64"),
            mimeType: job.data.mimeType,
            fileName: job.data.fileName,
        },
        provider
    );
}

export function startWhatsAppOutboundWorker() {
    if (!isQueueEnabled()) {
        waQueueLogger.info("WhatsApp outbound queue disabled; using direct send fallback");
        return;
    }

    if (outboundWorker) {
        return;
    }

    const reliability = getQueueReliabilityConfig();
    outboundWorker = new Worker<OutboundJobData, SendResult>(
        queueName(),
        processOutboundJob,
        {
            connection: getRedisConnection(),
            concurrency: parsePositiveIntEnv(process.env.WA_QUEUE_CONCURRENCY, 1),
            lockDuration: reliability.lockDurationMs,
            lockRenewTime: reliability.lockRenewTimeMs,
            stalledInterval: reliability.stalledIntervalMs,
            // WhatsApp sends are not safely replayable: the first browser call may
            // have delivered even when its BullMQ lock was lost.
            maxStalledCount: reliability.maxStalledCount,
        }
    );

    outboundWorker.on("completed", (job, result) => {
        waQueueLogger.info("WhatsApp outbound job completed", {
            jobId: job.id,
            kind: job.data.kind,
            scopeKey: job.data.scopeKey,
            sent: result?.sent || false,
            provider: result?.provider || currentProvider(),
        });
    });

    outboundWorker.on("failed", (job, error) => {
        waQueueLogger.error("WhatsApp outbound job failed", {
            jobId: job?.id || null,
            kind: job?.data?.kind || null,
            scopeKey: job?.data?.scopeKey || null,
            error,
        });

        if (/stalled more than allowable limit/i.test(error.message)) {
            void recoverWhatsAppQrBridge("outbound_job_stalled", error);
        }
    });

    waQueueLogger.info("WhatsApp outbound queue worker started", {
        queueName: queueName(),
        scopeKey: getOutboundScopeKey(),
        lockDurationMs: reliability.lockDurationMs,
        waitTimeoutMs: reliability.waitTimeoutMs,
        maxStalledCount: reliability.maxStalledCount,
    });
}

async function enqueueOutboundJob(
    data: OutboundJobData,
    options?: { jobId?: string }
): Promise<SendResult> {
    startWhatsAppOutboundWorker();

    const queue = getOutboundQueue();
    const queueEvents = getOutboundQueueEvents();
    const job = await queue.add(data.kind, data, options?.jobId ? { jobId: options.jobId } : {});
    const waitTimeoutMs = getQueueReliabilityConfig().waitTimeoutMs;

    waQueueLogger.info("WhatsApp outbound job queued", {
        jobId: job.id,
        kind: data.kind,
        to: data.to,
        scopeKey: data.scopeKey,
        waitTimeoutMs,
    });

    try {
        return await job.waitUntilFinished(queueEvents, waitTimeoutMs) as SendResult;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "Unknown error");
        const state = await job.getState().catch(() => "unknown" as const);

        if (state === "completed" && job.returnvalue) {
            return job.returnvalue as SendResult;
        }

        if (state === "failed" && job.failedReason) {
            throw new Error(job.failedReason);
        }

        if (/timed out|no finish notification/i.test(message)) {
            await recoverWhatsAppQrBridge("outbound_queue_wait_timeout", error);
            throw new Error(`WA_QUEUE_DELIVERY_UNCERTAIN:${state}:${message}`);
        }

        throw error;
    }
}

export async function sendWhatsAppText(
    to: string,
    body: string,
    options?: { jobId?: string }
): Promise<SendResult> {
    if (!isQueueEnabled()) {
        return sendWhatsAppTextDirect(to, body);
    }

    try {
        return await enqueueOutboundJob(
            {
                kind: "text",
                to,
                body,
                scopeKey: getOutboundScopeKey(),
            },
            options
        );
    } catch (error) {
        const provider = currentProvider();
        const message = error instanceof Error ? error.message : "Unknown queue error";
        waQueueLogger.error("WhatsApp text queue send failed", { error, to });
        return {
            sent: false,
            provider,
            error: message,
            errorCode: message.startsWith("WA_QUEUE_DELIVERY_UNCERTAIN")
                ? "WA_QUEUE_DELIVERY_UNCERTAIN"
                : "WA_QUEUE_ERROR",
        };
    }
}

export async function sendWhatsAppMedia(params: {
    to: string;
    body?: string;
    mediaBuffer: Buffer;
    mimeType: string;
    fileName?: string;
}): Promise<SendResult> {
    if (!isQueueEnabled()) {
        return sendWhatsAppMediaDirect(params);
    }

    try {
        return await enqueueOutboundJob({
            kind: "media",
            to: params.to,
            body: params.body,
            mediaBase64: params.mediaBuffer.toString("base64"),
            mimeType: params.mimeType,
            fileName: params.fileName,
            scopeKey: getOutboundScopeKey(),
        });
    } catch (error) {
        const provider = currentProvider();
        const message = error instanceof Error ? error.message : "Unknown queue error";
        waQueueLogger.error("WhatsApp media queue send failed", { error, to: params.to });
        return {
            sent: false,
            provider,
            error: message,
        };
    }
}
