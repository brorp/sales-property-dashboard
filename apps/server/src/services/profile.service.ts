import { db } from "../db";
import { user } from "../db/schema";
import { eq } from "drizzle-orm";

export async function getProfile(userId: string) {
    const [userData] = await db
        .select({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            image: user.image,
            createdAt: user.createdAt,
        })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);

    if (!userData) return null;

    return userData;
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
            image: user.image,
            phone: user.phone,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        });

    return updated || null;
}
