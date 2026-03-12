import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/index";
import { projectUnit } from "../db/schema";
import { generateId } from "../utils/id";

function sanitizeRequiredText(value: unknown) {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export async function listUnits(clientId?: string | null) {
    const conditions: any[] = [];
    if (clientId) {
        conditions.push(eq(projectUnit.clientId, clientId));
    }

    return db
        .select({
            id: projectUnit.id,
            clientId: projectUnit.clientId,
            projectType: projectUnit.projectType,
            unitName: projectUnit.unitName,
            createdAt: projectUnit.createdAt,
            updatedAt: projectUnit.updatedAt,
        })
        .from(projectUnit)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(projectUnit.projectType), asc(projectUnit.unitName), asc(projectUnit.createdAt));
}

export async function createUnit(params: {
    clientId: string;
    projectType: string;
    unitName: string;
}) {
    const projectType = sanitizeRequiredText(params.projectType);
    const unitName = sanitizeRequiredText(params.unitName);

    if (!projectType || !unitName) {
        throw new Error("UNIT_FIELDS_REQUIRED");
    }

    const now = new Date();
    const [created] = await db
        .insert(projectUnit)
        .values({
            id: generateId(),
            clientId: params.clientId,
            projectType,
            unitName,
            createdAt: now,
            updatedAt: now,
        })
        .returning();

    return created;
}

export async function updateUnit(params: {
    id: string;
    clientId: string;
    projectType?: string;
    unitName?: string;
}) {
    const [existing] = await db
        .select()
        .from(projectUnit)
        .where(and(eq(projectUnit.id, params.id), eq(projectUnit.clientId, params.clientId)))
        .limit(1);

    if (!existing) {
        return null;
    }

    const nextProjectType =
        params.projectType !== undefined
            ? sanitizeRequiredText(params.projectType)
            : existing.projectType;
    const nextUnitName =
        params.unitName !== undefined
            ? sanitizeRequiredText(params.unitName)
            : existing.unitName;

    if (!nextProjectType || !nextUnitName) {
        throw new Error("UNIT_FIELDS_REQUIRED");
    }

    const [updated] = await db
        .update(projectUnit)
        .set({
            projectType: nextProjectType,
            unitName: nextUnitName,
            updatedAt: new Date(),
        })
        .where(eq(projectUnit.id, params.id))
        .returning();

    return updated || existing;
}

export async function deleteUnit(params: { id: string; clientId: string }) {
    const [deleted] = await db
        .delete(projectUnit)
        .where(and(eq(projectUnit.id, params.id), eq(projectUnit.clientId, params.clientId)))
        .returning({
            id: projectUnit.id,
        });

    return deleted || null;
}
