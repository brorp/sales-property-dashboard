import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/index";
import { cancelReason } from "../db/schema";
import { generateId } from "../utils/id";

function sanitizeRequiredText(value: unknown) {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function sanitizeCode(value: unknown) {
    const raw = sanitizeRequiredText(value);
    if (!raw) {
        return null;
    }

    return raw
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

export async function listCancelReasons(clientId?: string | null, onlyActive = false) {
    const conditions: any[] = [];
    if (clientId) {
        conditions.push(eq(cancelReason.clientId, clientId));
    }
    if (onlyActive) {
        conditions.push(eq(cancelReason.isActive, true));
    }

    return db
        .select({
            id: cancelReason.id,
            clientId: cancelReason.clientId,
            code: cancelReason.code,
            label: cancelReason.label,
            isActive: cancelReason.isActive,
            sortOrder: cancelReason.sortOrder,
            createdAt: cancelReason.createdAt,
            updatedAt: cancelReason.updatedAt,
        })
        .from(cancelReason)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(asc(cancelReason.sortOrder), asc(cancelReason.label), asc(cancelReason.createdAt));
}

export async function assertActiveCancelReason(clientId: string | null | undefined, code: string) {
    if (!clientId) {
        throw new Error("INVALID_CANCEL_REASON");
    }

    const normalizedCode = sanitizeCode(code);
    if (!normalizedCode) {
        throw new Error("INVALID_CANCEL_REASON");
    }

    const [row] = await db
        .select({
            id: cancelReason.id,
            code: cancelReason.code,
            label: cancelReason.label,
            isActive: cancelReason.isActive,
        })
        .from(cancelReason)
        .where(
            and(
                eq(cancelReason.clientId, clientId),
                eq(cancelReason.code, normalizedCode),
                eq(cancelReason.isActive, true)
            )
        )
        .limit(1);

    if (!row) {
        throw new Error("INVALID_CANCEL_REASON");
    }

    return row;
}

export async function createCancelReason(params: {
    clientId: string;
    code: string;
    label: string;
    isActive?: boolean;
    sortOrder?: number;
}) {
    const code = sanitizeCode(params.code);
    const label = sanitizeRequiredText(params.label);

    if (!code || !label) {
        throw new Error("CANCEL_REASON_FIELDS_REQUIRED");
    }

    const now = new Date();
    const [created] = await db
        .insert(cancelReason)
        .values({
            id: generateId(),
            clientId: params.clientId,
            code,
            label,
            isActive: params.isActive ?? true,
            sortOrder: Number.isFinite(params.sortOrder) ? Number(params.sortOrder) : 0,
            createdAt: now,
            updatedAt: now,
        })
        .returning();

    return created;
}

export async function updateCancelReason(params: {
    id: string;
    clientId: string;
    code?: string;
    label?: string;
    isActive?: boolean;
    sortOrder?: number;
}) {
    const [existing] = await db
        .select()
        .from(cancelReason)
        .where(and(eq(cancelReason.id, params.id), eq(cancelReason.clientId, params.clientId)))
        .limit(1);

    if (!existing) {
        return null;
    }

    const nextCode =
        params.code !== undefined
            ? sanitizeCode(params.code)
            : existing.code;
    const nextLabel =
        params.label !== undefined
            ? sanitizeRequiredText(params.label)
            : existing.label;

    if (!nextCode || !nextLabel) {
        throw new Error("CANCEL_REASON_FIELDS_REQUIRED");
    }

    const [updated] = await db
        .update(cancelReason)
        .set({
            code: nextCode,
            label: nextLabel,
            isActive: params.isActive ?? existing.isActive,
            sortOrder: Number.isFinite(params.sortOrder) ? Number(params.sortOrder) : existing.sortOrder,
            updatedAt: new Date(),
        })
        .where(eq(cancelReason.id, params.id))
        .returning();

    return updated || existing;
}

export async function deleteCancelReason(params: { id: string; clientId: string }) {
    const [deleted] = await db
        .delete(cancelReason)
        .where(and(eq(cancelReason.id, params.id), eq(cancelReason.clientId, params.clientId)))
        .returning({
            id: cancelReason.id,
        });

    return deleted || null;
}
