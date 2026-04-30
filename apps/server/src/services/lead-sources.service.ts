import { and, asc, eq, ilike } from "drizzle-orm";
import { FIXED_LEAD_SOURCE_OPTIONS } from "../constants/lead-sources";
import { db } from "../db/index";
import { lead, leadSourceOption } from "../db/schema";
import { generateId } from "../utils/id";

function sanitizeSourceName(value: unknown) {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim().replace(/\s+/g, " ");
    return trimmed.length > 0 ? trimmed : null;
}

function normalizeForCompare(value: unknown) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

async function ensureDefaultSources(clientId: string) {
    const now = new Date();
    const existing = await db
        .select({ value: leadSourceOption.value })
        .from(leadSourceOption)
        .where(eq(leadSourceOption.clientId, clientId));

    if (existing.length > 0) {
        return;
    }

    await db.insert(leadSourceOption).values(
        FIXED_LEAD_SOURCE_OPTIONS.map((value) => ({
            id: generateId(),
            clientId,
            value,
            createdAt: now,
            updatedAt: now,
        }))
    );
}

export async function listLeadSources(clientId?: string | null) {
    if (!clientId) {
        return [];
    }

    await ensureDefaultSources(clientId);

    return db
        .select({
            id: leadSourceOption.id,
            clientId: leadSourceOption.clientId,
            value: leadSourceOption.value,
            createdAt: leadSourceOption.createdAt,
            updatedAt: leadSourceOption.updatedAt,
        })
        .from(leadSourceOption)
        .where(eq(leadSourceOption.clientId, clientId))
        .orderBy(asc(leadSourceOption.value), asc(leadSourceOption.createdAt));
}

export async function resolveLeadSourceValue(clientId: string | null | undefined, value: unknown) {
    const requestedValue = sanitizeSourceName(value);
    if (!requestedValue || !clientId) {
        throw new Error("LEAD_SOURCE_VALUE_REQUIRED");
    }

    await ensureDefaultSources(clientId);

    const [matched] = await db
        .select({
            value: leadSourceOption.value,
        })
        .from(leadSourceOption)
        .where(
            and(
                eq(leadSourceOption.clientId, clientId),
                ilike(leadSourceOption.value, requestedValue)
            )
        )
        .limit(1);

    if (!matched) {
        throw new Error("INVALID_LEAD_SOURCE");
    }

    return matched.value;
}

export async function createLeadSource(params: {
    clientId: string;
    value: string;
}) {
    const value = sanitizeSourceName(params.value);
    if (!value) {
        throw new Error("LEAD_SOURCE_VALUE_REQUIRED");
    }

    const existing = await listLeadSources(params.clientId);
    const duplicate = existing.some(
        (item) => normalizeForCompare(item.value) === normalizeForCompare(value)
    );
    if (duplicate) {
        throw new Error("LEAD_SOURCE_ALREADY_EXISTS");
    }

    const now = new Date();
    const [created] = await db
        .insert(leadSourceOption)
        .values({
            id: generateId(),
            clientId: params.clientId,
            value,
            createdAt: now,
            updatedAt: now,
        })
        .returning();

    return created;
}

export async function updateLeadSource(params: {
    id: string;
    clientId: string;
    value?: string;
}) {
    const [existing] = await db
        .select()
        .from(leadSourceOption)
        .where(and(eq(leadSourceOption.id, params.id), eq(leadSourceOption.clientId, params.clientId)))
        .limit(1);

    if (!existing) {
        return null;
    }

    const value = params.value !== undefined ? sanitizeSourceName(params.value) : existing.value;
    if (!value) {
        throw new Error("LEAD_SOURCE_VALUE_REQUIRED");
    }

    const rows = await listLeadSources(params.clientId);
    const duplicate = rows.some(
        (item) =>
            item.id !== params.id &&
            normalizeForCompare(item.value) === normalizeForCompare(value)
    );
    if (duplicate) {
        throw new Error("LEAD_SOURCE_ALREADY_EXISTS");
    }

    const [updated] = await db
        .update(leadSourceOption)
        .set({
            value,
            updatedAt: new Date(),
        })
        .where(eq(leadSourceOption.id, params.id))
        .returning();

    return updated || existing;
}

export async function deleteLeadSource(params: { id: string; clientId: string }) {
    const [deleted] = await db
        .delete(leadSourceOption)
        .where(and(eq(leadSourceOption.id, params.id), eq(leadSourceOption.clientId, params.clientId)))
        .returning({
            id: leadSourceOption.id,
        });

    return deleted || null;
}

export async function listAgentOfficeNames(clientId?: string | null) {
    if (!clientId) {
        return [];
    }

    const rows = await db
        .select({
            agentOfficeName: lead.agentOfficeName,
        })
        .from(lead)
        .where(and(eq(lead.clientId, clientId), ilike(lead.source, "Agent")));

    const values = new Map<string, string>();
    for (const row of rows) {
        const value = sanitizeSourceName(row.agentOfficeName);
        if (!value) {
            continue;
        }
        values.set(normalizeForCompare(value), value);
    }

    return Array.from(values.values()).sort((a, b) => a.localeCompare(b));
}
