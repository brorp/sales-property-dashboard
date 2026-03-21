import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/index";
import { leadSourceOption } from "../db/schema";
import { generateId } from "../utils/id";

function sanitizeRequiredText(value: unknown) {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export async function listLeadSources(clientId?: string | null) {
    if (!clientId) {
        return [];
    }

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

export async function createLeadSource(params: {
    clientId: string;
    value: string;
}) {
    const value = sanitizeRequiredText(params.value);
    if (!value) {
        throw new Error("LEAD_SOURCE_VALUE_REQUIRED");
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
        .where(
            and(
                eq(leadSourceOption.id, params.id),
                eq(leadSourceOption.clientId, params.clientId)
            )
        )
        .limit(1);

    if (!existing) {
        return null;
    }

    const nextValue =
        params.value !== undefined ? sanitizeRequiredText(params.value) : existing.value;

    if (!nextValue) {
        throw new Error("LEAD_SOURCE_VALUE_REQUIRED");
    }

    const [updated] = await db
        .update(leadSourceOption)
        .set({
            value: nextValue,
            updatedAt: new Date(),
        })
        .where(eq(leadSourceOption.id, params.id))
        .returning();

    return updated || existing;
}

export async function deleteLeadSource(params: { id: string; clientId: string }) {
    const [deleted] = await db
        .delete(leadSourceOption)
        .where(
            and(
                eq(leadSourceOption.id, params.id),
                eq(leadSourceOption.clientId, params.clientId)
            )
        )
        .returning({
            id: leadSourceOption.id,
        });

    return deleted || null;
}
