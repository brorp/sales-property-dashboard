import { db } from "../db/index";
import { client, user } from "../db/schema";
import { eq } from "drizzle-orm";
import { getActiveSalesSuspension } from "./sales-suspension.service";

export async function getProfile(userId: string) {
    const [userData] = await db
        .select({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            clientId: user.clientId,
            clientSlug: client.slug,
            clientName: client.name,
            supervisorId: user.supervisorId,
            image: user.image,
            createdAt: user.createdAt,
        })
        .from(user)
        .leftJoin(client, eq(user.clientId, client.id))
        .where(eq(user.id, userId))
        .limit(1);

    if (!userData) return null;

    const suspension =
        userData.role === "sales"
            ? await getActiveSalesSuspension(userData.id)
            : null;

    return {
        ...userData,
        isSuspended: Boolean(suspension),
        suspension: suspension
            ? {
                penaltyLayer: suspension.penaltyLayer,
                suspendedDays: suspension.suspendedDays,
                suspendedFrom: suspension.suspendedFrom,
                suspendedUntil: suspension.suspendedUntil,
                ruleCode: suspension.ruleCode,
            }
            : null,
    };
}

function sanitizeOptionalText(value: unknown) {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return null;
    }
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export async function updateProfile(
    userId: string,
    payload: {
        name?: string;
        phone?: string | null;
        image?: string | null;
    }
) {
    const updates: Record<string, unknown> = {
        updatedAt: new Date(),
    };

    const nextName = sanitizeOptionalText(payload.name);
    if (typeof nextName === "string") {
        updates.name = nextName;
    }

    const nextPhone = sanitizeOptionalText(payload.phone);
    if (nextPhone !== undefined) {
        updates.phone = nextPhone;
    }

    const nextImage = sanitizeOptionalText(payload.image);
    if (nextImage !== undefined) {
        updates.image = nextImage;
    }

    const [updated] = await db
        .update(user)
        .set(updates)
        .where(eq(user.id, userId))
        .returning({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            clientId: user.clientId,
            supervisorId: user.supervisorId,
            image: user.image,
            phone: user.phone,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        });
    if (!updated) {
        return null;
    }

    return getProfile(updated.id);
}
