import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/index";
import { client, whatsappOperationalAlert } from "../db/schema";
import { generateId } from "../utils/id";
import { createComponentLogger } from "../utils/logger";

const alertLogger = createComponentLogger("wa:alert");

export type WhatsAppAlertSeverity = "warning" | "error" | "critical";

export type WhatsAppAlertInput = {
    eventCode: string;
    component: string;
    message: string;
    severity?: WhatsAppAlertSeverity;
    clientId?: string | null;
    workspaceSlug?: string | null;
    leadId?: string | null;
    salesId?: string | null;
    metadata?: Record<string, unknown> | null;
    dedupeKey?: string | null;
};

function activeWorkspaceSlug() {
    const slug = String(process.env.WA_ACTIVE_CLIENT_SLUG || "").trim().toLowerCase();
    return slug || null;
}

function safeMetadataJson(metadata?: Record<string, unknown> | null) {
    if (!metadata) {
        return null;
    }

    try {
        return JSON.stringify(metadata);
    } catch {
        return JSON.stringify({ serializationError: true });
    }
}

function buildFingerprint(input: WhatsAppAlertInput, workspaceSlug: string | null) {
    const source = input.dedupeKey
        ? `${workspaceSlug || "global"}|${input.eventCode}|${input.dedupeKey}`
        : [
            workspaceSlug || "global",
            input.eventCode,
            input.leadId || "-",
            input.salesId || "-",
            input.message.trim().toLowerCase(),
        ].join("|");

    return createHash("sha256").update(source).digest("hex");
}

async function resolveClientContext(input: WhatsAppAlertInput) {
    const workspaceSlug = input.workspaceSlug || activeWorkspaceSlug();
    if (input.clientId || !workspaceSlug) {
        return {
            clientId: input.clientId || null,
            workspaceSlug,
        };
    }

    const [row] = await db
        .select({ id: client.id })
        .from(client)
        .where(eq(client.slug, workspaceSlug))
        .limit(1);

    return {
        clientId: row?.id || null,
        workspaceSlug,
    };
}

export async function recordWhatsAppAlert(input: WhatsAppAlertInput) {
    try {
        const context = await resolveClientContext(input);
        const fingerprint = buildFingerprint(input, context.workspaceSlug);
        const now = new Date();
        const [row] = await db
            .insert(whatsappOperationalAlert)
            .values({
                id: generateId(),
                fingerprint,
                clientId: context.clientId,
                workspaceSlug: context.workspaceSlug,
                severity: input.severity || "error",
                component: input.component,
                eventCode: input.eventCode,
                message: input.message,
                status: "open",
                occurrenceCount: 1,
                leadId: input.leadId || null,
                salesId: input.salesId || null,
                metadata: safeMetadataJson(input.metadata),
                firstOccurredAt: now,
                lastOccurredAt: now,
                createdAt: now,
                updatedAt: now,
            })
            .onConflictDoUpdate({
                target: whatsappOperationalAlert.fingerprint,
                set: {
                    clientId: context.clientId,
                    workspaceSlug: context.workspaceSlug,
                    severity: input.severity || "error",
                    component: input.component,
                    message: input.message,
                    status: "open",
                    occurrenceCount: sql`${whatsappOperationalAlert.occurrenceCount} + 1`,
                    leadId: input.leadId || null,
                    salesId: input.salesId || null,
                    metadata: safeMetadataJson(input.metadata),
                    lastOccurredAt: now,
                    resolvedAt: null,
                    updatedAt: now,
                },
            })
            .returning({
                id: whatsappOperationalAlert.id,
                fingerprint: whatsappOperationalAlert.fingerprint,
                occurrenceCount: whatsappOperationalAlert.occurrenceCount,
            });

        alertLogger.warn("WhatsApp operational alert recorded", {
            alertId: row?.id || null,
            eventCode: input.eventCode,
            severity: input.severity || "error",
            clientId: context.clientId,
            workspaceSlug: context.workspaceSlug,
            leadId: input.leadId || null,
            salesId: input.salesId || null,
            occurrenceCount: row?.occurrenceCount || 1,
        });

        return row || null;
    } catch (error) {
        alertLogger.error("Failed persisting WhatsApp operational alert", {
            eventCode: input.eventCode,
            error,
        });
        return null;
    }
}

export async function resolveWhatsAppAlert(input: {
    eventCode: string;
    dedupeKey?: string | null;
    workspaceSlug?: string | null;
    clientId?: string | null;
    leadId?: string | null;
    salesId?: string | null;
    message?: string;
}) {
    try {
        const context = await resolveClientContext({
            ...input,
            component: "wa:alert",
            message: input.message || "resolved",
        });
        const fingerprint = buildFingerprint(
            {
                ...input,
                component: "wa:alert",
                message: input.message || "resolved",
            },
            context.workspaceSlug
        );
        const now = new Date();
        await db
            .update(whatsappOperationalAlert)
            .set({
                status: "resolved",
                resolvedAt: now,
                updatedAt: now,
            })
            .where(eq(whatsappOperationalAlert.fingerprint, fingerprint));
    } catch (error) {
        alertLogger.error("Failed resolving WhatsApp operational alert", { error });
    }
}

export async function resolveWhatsAppAlertsForClient(
    clientId: string,
    eventCodes: string[]
) {
    if (eventCodes.length === 0) {
        return;
    }

    try {
        const now = new Date();
        await db
            .update(whatsappOperationalAlert)
            .set({
                status: "resolved",
                resolvedAt: now,
                updatedAt: now,
            })
            .where(
                and(
                    eq(whatsappOperationalAlert.clientId, clientId),
                    eq(whatsappOperationalAlert.status, "open"),
                    inArray(whatsappOperationalAlert.eventCode, eventCodes)
                )
            );
    } catch (error) {
        alertLogger.error("Failed resolving WhatsApp operational alerts", {
            clientId,
            eventCodes,
            error,
        });
    }
}
