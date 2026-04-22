import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db/index";
import { appointment, lead, waMessage } from "../db/schema";
import { generateId } from "../utils/id";
import { normalizePhone } from "../utils/phone";
import { resolveAppointmentTag, toAppointmentDateTime } from "../utils/appointment";
import { getActiveWhatsAppNumber } from "./whatsapp-identity.service";
import { sendWhatsAppMedia, sendWhatsAppText } from "./whatsapp-provider.service";
import { logger } from "../utils/logger";

type AppointmentTagFilter = "all" | "mau_survey" | "sudah_survey" | "none";

export interface StartBroadcastInput {
    salesStatuses: string[];
    appointmentTag?: AppointmentTagFilter;
    dateFrom?: string;
    dateTo?: string;
    message?: string;
    mediaDataUrl?: string;
    intervalSeconds?: number;
    intervalMinutes?: number;
}

type BroadcastTarget = {
    leadId: string;
    leadName: string;
    phone: string;
};

type BroadcastQueueItem = BroadcastTarget & {
    attempt: number;
};

type BroadcastJobState = {
    id: string;
    status: "idle" | "running" | "stopped" | "completed" | "error";
    startedAt: Date | null;
    finishedAt: Date | null;
    startedBy: string | null;
    filters: {
        salesStatuses: string[];
        appointmentTag: AppointmentTagFilter;
        dateFrom: string | null;
        dateTo: string | null;
    };
    intervalSeconds: number;
    message: string;
    hasMedia: boolean;
    mediaMimeType: string | null;
    totalTargets: number;
    processedTargets: number;
    sentCount: number;
    failedCount: number;
    currentIndex: number;
    lastError: string | null;
    maxRetries: number;
    clientId: string | null;
};

type ResolvedBroadcastFilters = {
    salesStatuses: string[];
    appointmentTag: AppointmentTagFilter;
    dateFrom: Date | null;
    dateTo: Date | null;
    rawDateFrom: string | null;
    rawDateTo: string | null;
};

type BroadcastJobRuntime = {
    state: BroadcastJobState;
    queue: BroadcastQueueItem[];
    mediaBuffer: Buffer | null;
    mediaMimeType: string | null;
    mediaFileName: string | null;
};

const SALES_STATUS_ALLOWED = new Set(["hot", "warm", "cold", "error", "no_response", "skip"]);
const BROADCAST_MAX_RETRY_ATTEMPTS = Number(
    process.env.BROADCAST_MAX_RETRY_ATTEMPTS || "5"
);
const BROADCAST_MIN_INTERVAL_SECONDS = Number(
    process.env.BROADCAST_MIN_INTERVAL_SECONDS || "8"
);
const BROADCAST_RANDOM_JITTER_SECONDS = Number(
    process.env.BROADCAST_RANDOM_JITTER_SECONDS || "4"
);

const currentJobs = new Map<string, BroadcastJobRuntime>();
const timers = new Map<string, NodeJS.Timeout>();

function getScopeKey(clientId?: string | null) {
    return clientId || "__global__";
}

function stopTimer(scopeKey: string) {
    const timer = timers.get(scopeKey);
    if (timer) {
        clearTimeout(timer);
        timers.delete(scopeKey);
    }
}

function parseMediaDataUrl(dataUrl: string) {
    const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
    if (!match) {
        throw new Error("INVALID_MEDIA_DATA_URL");
    }

    const mimeType = match[1] || "";
    const base64 = match[2] || "";
    const mediaBuffer = Buffer.from(base64, "base64");
    if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) {
        throw new Error("MEDIA_TYPE_NOT_SUPPORTED");
    }
    if (!mediaBuffer || mediaBuffer.length === 0) {
        throw new Error("MEDIA_EMPTY");
    }

    return {
        mediaBuffer,
        mimeType,
    };
}

function toDateStart(dateValue?: string) {
    if (!dateValue) {
        return null;
    }
    const dt = new Date(`${dateValue}T00:00:00`);
    return Number.isNaN(dt.getTime()) ? null : dt;
}

function toDateEnd(dateValue?: string) {
    if (!dateValue) {
        return null;
    }
    const dt = new Date(`${dateValue}T23:59:59.999`);
    return Number.isNaN(dt.getTime()) ? null : dt;
}

function sanitizeStatuses(input: string[]) {
    const unique = Array.from(
        new Set(
            (Array.isArray(input) ? input : [])
                .map((value) => String(value || "").trim())
                .filter(Boolean)
        )
    );

    const valid = unique.filter((value) => SALES_STATUS_ALLOWED.has(value));
    if (valid.length === 0) {
        throw new Error("BROADCAST_STATUS_EMPTY");
    }
    return valid;
}

function sanitizeAppointmentTag(value: unknown): AppointmentTagFilter {
    const raw = String(value || "all");
    if (raw === "mau_survey" || raw === "sudah_survey" || raw === "none") {
        return raw;
    }
    return "all";
}

function getBroadcastMinIntervalSeconds() {
    const parsed = Number(BROADCAST_MIN_INTERVAL_SECONDS);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 8;
    }
    return Math.floor(parsed);
}

function getBroadcastRandomJitterMs() {
    const parsed = Number(BROADCAST_RANDOM_JITTER_SECONDS);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 0;
    }
    return Math.floor(parsed * 1000);
}

function sanitizeIntervalSeconds(value: unknown, fallbackMinutes?: unknown) {
    let parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
        const parsedMinutes = Number(fallbackMinutes);
        if (Number.isFinite(parsedMinutes) && parsedMinutes > 0) {
            parsed = parsedMinutes * 60;
        }
    }

    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("BROADCAST_INTERVAL_INVALID");
    }

    return Math.max(Math.ceil(parsed), getBroadcastMinIntervalSeconds());
}

function resolveNextBroadcastDelayMs(intervalSeconds: number) {
    const baseDelayMs = Math.max(1, intervalSeconds * 1000);
    const jitterMs = getBroadcastRandomJitterMs();
    const randomJitterMs = jitterMs > 0 ? Math.floor(Math.random() * (jitterMs + 1)) : 0;
    return baseDelayMs + randomJitterMs;
}

function getBroadcastMaxRetryAttempts() {
    const parsed = Number(BROADCAST_MAX_RETRY_ATTEMPTS);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 5;
    }
    return Math.floor(parsed);
}

function resolveBroadcastFilters(input: Pick<
    StartBroadcastInput,
    "salesStatuses" | "appointmentTag" | "dateFrom" | "dateTo"
>) {
    return {
        salesStatuses: sanitizeStatuses(input.salesStatuses || []),
        appointmentTag: sanitizeAppointmentTag(input.appointmentTag),
        dateFrom: toDateStart(input.dateFrom),
        dateTo: toDateEnd(input.dateTo),
        rawDateFrom: input.dateFrom || null,
        rawDateTo: input.dateTo || null,
    } satisfies ResolvedBroadcastFilters;
}

function buildStateForResponse(state: BroadcastJobState | null) {
    if (!state) {
        return {
            id: null,
            status: "idle",
            startedAt: null,
            finishedAt: null,
            totalTargets: 0,
            processedTargets: 0,
            sentCount: 0,
            failedCount: 0,
            currentIndex: 0,
            lastError: null,
            maxRetries: 0,
        };
    }
    return state;
}

async function getTargets(filters: {
    salesStatuses: string[];
    appointmentTag: AppointmentTagFilter;
    dateFrom: Date | null;
    dateTo: Date | null;
}, clientId?: string | null) {
    const conditions: any[] = [inArray(lead.salesStatus, filters.salesStatuses)];
    if (clientId) {
        conditions.push(eq(lead.clientId, clientId));
    }
    if (filters.dateFrom) {
        conditions.push(gte(lead.receivedAt, filters.dateFrom));
    }
    if (filters.dateTo) {
        conditions.push(lte(lead.receivedAt, filters.dateTo));
    }

    const leads = await db
        .select({
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
        })
        .from(lead)
        .where(and(...conditions));

    if (leads.length === 0) {
        return [];
    }

    const leadIds = leads.map((item) => item.id);
    const appointmentRows = await db
        .select({
            leadId: appointment.leadId,
            date: appointment.date,
            time: appointment.time,
            status: appointment.status,
        })
        .from(appointment)
        .where(inArray(appointment.leadId, leadIds));

    const latestAppointmentByLead = new Map<string, {
        date: string;
        time: string;
        status: string;
    }>();
    for (const item of appointmentRows) {
        const prev = latestAppointmentByLead.get(item.leadId);
        if (!prev) {
            latestAppointmentByLead.set(item.leadId, {
                date: item.date,
                time: item.time,
                status: item.status,
            });
            continue;
        }

        const prevTs = toAppointmentDateTime(prev.date, prev.time).getTime();
        const nextTs = toAppointmentDateTime(item.date, item.time).getTime();
        if (nextTs > prevTs) {
            latestAppointmentByLead.set(item.leadId, {
                date: item.date,
                time: item.time,
                status: item.status,
            });
        }
    }

    const filteredByAppointment =
        filters.appointmentTag === "all"
            ? leads
            : leads.filter((item) => {
                const latestAppointment = latestAppointmentByLead.get(item.id) || null;
                const tag = resolveAppointmentTag(latestAppointment);
                return tag === filters.appointmentTag;
            });

    const dedupeByPhone = new Map<string, BroadcastTarget>();
    for (const item of filteredByAppointment) {
        const normalized = normalizePhone(item.phone);
        if (!normalized) {
            continue;
        }
        if (!dedupeByPhone.has(normalized)) {
            dedupeByPhone.set(normalized, {
                leadId: item.id,
                leadName: item.name,
                phone: normalized,
            });
        }
    }

    return Array.from(dedupeByPhone.values());
}

async function sendBroadcastMessage(params: {
    target: BroadcastTarget;
    message: string;
    mediaBuffer: Buffer | null;
    mediaMimeType: string | null;
    mediaFileName: string | null;
}) {
    if (params.mediaBuffer && params.mediaMimeType) {
        return sendWhatsAppMedia({
            to: params.target.phone,
            body: params.message,
            mediaBuffer: params.mediaBuffer,
            mimeType: params.mediaMimeType,
            fileName: params.mediaFileName || undefined,
        });
    }

    return sendWhatsAppText(params.target.phone, params.message);
}

function finalizeBroadcastStatus(
    scopeKey: string,
    state: BroadcastJobState,
    status: BroadcastJobState["status"],
    errorMessage?: string
) {
    state.status = status;
    state.finishedAt = new Date();
    if (errorMessage) {
        state.lastError = errorMessage;
    }
    stopTimer(scopeKey);
}

function scheduleNextBroadcast(scopeKey: string, delayMs: number) {
    stopTimer(scopeKey);
    const timer = setTimeout(() => {
        void processNextBroadcast(scopeKey);
    }, Math.max(0, delayMs));
    timers.set(scopeKey, timer);
}

async function persistBroadcastAttemptLog(params: {
    target: BroadcastTarget;
    message: string;
    providerMessageId: string | null;
    sendError: string | null;
}) {
    try {
        await db.insert(waMessage).values({
            id: generateId(),
            providerMessageId: params.providerMessageId,
            fromWa: getActiveWhatsAppNumber(),
            toWa: params.target.phone,
            body: params.message,
            direction: params.sendError ? "outbound_broadcast_failed" : "outbound_broadcast",
            leadId: params.target.leadId,
            salesId: null,
            createdAt: new Date(),
        });
    } catch (error) {
        logger.error("[broadcast-worker] failed persisting wa_message log", { error });
    }
}

async function processNextBroadcast(scopeKey: string) {
    const runtime = currentJobs.get(scopeKey) || null;
    if (!runtime) {
        return;
    }
    const state = runtime.state;

    if (state.status !== "running") {
        return;
    }

    if (state.processedTargets >= state.totalTargets || runtime.queue.length === 0) {
        finalizeBroadcastStatus(scopeKey, state, "completed");
        return;
    }

    const queueItem = runtime.queue.shift();
    if (!queueItem) {
        finalizeBroadcastStatus(scopeKey, state, "completed");
        return;
    }

    let sendSucceeded = false;
    let providerMessageId: string | null = null;
    let sendError: string | null = null;

    try {
        const result = await sendBroadcastMessage({
            target: queueItem,
            message: state.message,
            mediaBuffer: runtime.mediaBuffer,
            mediaMimeType: runtime.mediaMimeType,
            mediaFileName: runtime.mediaFileName,
        });

        if (result.sent) {
            sendSucceeded = true;
            providerMessageId = result.providerMessageId || null;
        } else {
            sendError = result.error || "Unknown broadcast send error";
        }
    } catch (error) {
        sendError = error instanceof Error ? error.message : "Unknown broadcast error";
    }

    await persistBroadcastAttemptLog({
        target: queueItem,
        message: state.message,
        providerMessageId,
        sendError,
    });

    if (state.status !== "running") {
        return;
    }

    if (sendSucceeded) {
        state.sentCount += 1;
        state.processedTargets += 1;
    } else if (queueItem.attempt + 1 < state.maxRetries) {
        runtime.queue.push({
            ...queueItem,
            attempt: queueItem.attempt + 1,
        });
        state.lastError = sendError || "Unknown broadcast send error";
    } else {
        state.failedCount += 1;
        state.processedTargets += 1;
        state.lastError = sendError || "Unknown broadcast send error";
    }

    state.currentIndex = state.processedTargets;

    if (state.processedTargets >= state.totalTargets || runtime.queue.length === 0) {
        finalizeBroadcastStatus(scopeKey, state, "completed");
        return;
    }

    const nextDelayMs = resolveNextBroadcastDelayMs(state.intervalSeconds);
    scheduleNextBroadcast(scopeKey, nextDelayMs);
}

export function getBroadcastStatus(clientId?: string | null) {
    return buildStateForResponse(currentJobs.get(getScopeKey(clientId))?.state || null);
}

export async function estimateBroadcast(
    input: Pick<StartBroadcastInput, "salesStatuses" | "appointmentTag" | "dateFrom" | "dateTo">,
    clientId?: string | null
) {
    const filters = resolveBroadcastFilters(input);
    const targets = await getTargets(
        {
            salesStatuses: filters.salesStatuses,
            appointmentTag: filters.appointmentTag,
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
        },
        clientId
    );

    return {
        totalTargets: targets.length,
        filters: {
            salesStatuses: filters.salesStatuses,
            appointmentTag: filters.appointmentTag,
            dateFrom: filters.rawDateFrom,
            dateTo: filters.rawDateTo,
        },
    };
}

export async function startBroadcast(
    input: StartBroadcastInput,
    startedBy: string,
    clientId?: string | null
) {
    const scopeKey = getScopeKey(clientId);
    const currentJob = currentJobs.get(scopeKey) || null;

    if (currentJob && currentJob.state.status === "running") {
        throw new Error("BROADCAST_ALREADY_RUNNING");
    }

    const filters = resolveBroadcastFilters(input);
    const intervalSeconds = sanitizeIntervalSeconds(
        input.intervalSeconds,
        input.intervalMinutes
    );
    const message = String(input.message || "").trim();
    const maxRetries = getBroadcastMaxRetryAttempts();

    let mediaBuffer: Buffer | null = null;
    let mediaMimeType: string | null = null;
    let mediaFileName: string | null = null;

    if (input.mediaDataUrl) {
        const media = parseMediaDataUrl(input.mediaDataUrl);
        mediaBuffer = media.mediaBuffer;
        mediaMimeType = media.mimeType;
        mediaFileName = media.mimeType.startsWith("video/") ? "broadcast-video" : "broadcast-image";
    }

    if (!message && !mediaBuffer) {
        throw new Error("BROADCAST_CONTENT_EMPTY");
    }

    const targets = await getTargets(
        {
            salesStatuses: filters.salesStatuses,
            appointmentTag: filters.appointmentTag,
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
        },
        clientId
    );

    if (targets.length === 0) {
        throw new Error("BROADCAST_NO_TARGET");
    }

    const state: BroadcastJobState = {
        id: generateId(),
        status: "running",
        startedAt: new Date(),
        finishedAt: null,
        startedBy,
        filters: {
            salesStatuses: filters.salesStatuses,
            appointmentTag: filters.appointmentTag,
            dateFrom: filters.rawDateFrom,
            dateTo: filters.rawDateTo,
        },
        intervalSeconds,
        message,
        hasMedia: Boolean(mediaBuffer),
        mediaMimeType,
        totalTargets: targets.length,
        processedTargets: 0,
        sentCount: 0,
        failedCount: 0,
        currentIndex: 0,
        lastError: null,
        maxRetries,
        clientId: clientId || null,
    };

    currentJobs.set(scopeKey, {
        state,
        queue: targets.map((item) => ({
            ...item,
            attempt: 0,
        })),
        mediaBuffer,
        mediaMimeType,
        mediaFileName,
    });

    scheduleNextBroadcast(scopeKey, resolveNextBroadcastDelayMs(state.intervalSeconds));

    return buildStateForResponse(state);
}

export function stopBroadcast(clientId?: string | null) {
    const scopeKey = getScopeKey(clientId);
    const currentJob = currentJobs.get(scopeKey) || null;

    if (!currentJob || currentJob.state.status !== "running") {
        return buildStateForResponse(currentJob?.state || null);
    }

    currentJob.state.status = "stopped";
    currentJob.state.finishedAt = new Date();
    stopTimer(scopeKey);
    return buildStateForResponse(currentJob.state);
}
