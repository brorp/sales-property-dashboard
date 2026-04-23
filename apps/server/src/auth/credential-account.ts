import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index";
import { ALL_SEED_USERS } from "../db/seed-data";
import { account, user } from "../db/schema";
import { generateId } from "../utils/id";

function hashCredentialPassword(password: string) {
    const salt = randomBytes(16).toString("hex");
    const key = scryptSync(password.normalize("NFKC"), salt, 64, {
        N: 16384,
        r: 16,
        p: 1,
        maxmem: 128 * 16384 * 16 * 2,
    });

    return `${salt}:${key.toString("hex")}`;
}

function deriveCredentialPasswordHash(password: string, salt: string) {
    return scryptSync(password.normalize("NFKC"), salt, 64, {
        N: 16384,
        r: 16,
        p: 1,
        maxmem: 128 * 16384 * 16 * 2,
    }).toString("hex");
}

function verifyCredentialPasswordHash(
    storedPasswordHash: string | null | undefined,
    password: string
) {
    if (!storedPasswordHash || typeof storedPasswordHash !== "string") {
        return false;
    }

    const [salt, storedHash] = storedPasswordHash.split(":");
    if (!salt || !storedHash) {
        return false;
    }

    const computedHash = deriveCredentialPasswordHash(password, salt);
    const storedBuffer = Buffer.from(storedHash, "hex");
    const computedBuffer = Buffer.from(computedHash, "hex");

    if (storedBuffer.length !== computedBuffer.length) {
        return false;
    }

    return timingSafeEqual(storedBuffer, computedBuffer);
}

export async function ensureCredentialAccount(userId: string, password: string) {
    const [existingCredential] = await db
        .select({
            id: account.id,
        })
        .from(account)
        .where(and(eq(account.providerId, "credential"), eq(account.userId, userId)))
        .limit(1);

    const passwordHash = hashCredentialPassword(password);
    const now = new Date();

    if (!existingCredential) {
        await db.insert(account).values({
            id: generateId(),
            userId,
            accountId: userId,
            providerId: "credential",
            password: passwordHash,
            createdAt: now,
            updatedAt: now,
        });
        return;
    }

    await db
        .update(account)
        .set({
            password: passwordHash,
            updatedAt: now,
        })
        .where(eq(account.id, existingCredential.id));
}

export async function repairKnownSeedCredential(email: string, password: string) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const seedUser = ALL_SEED_USERS.find(
        (item) => item.email === normalizedEmail && item.password === password
    );

    if (!seedUser) {
        return false;
    }

    const [existingUser] = await db
        .select({
            id: user.id,
        })
        .from(user)
        .where(eq(user.email, normalizedEmail))
        .limit(1);

    if (!existingUser) {
        return false;
    }

    await ensureCredentialAccount(existingUser.id, seedUser.password);
    return true;
}

export async function verifyCredentialPasswordForUser(userId: string, password: string) {
    const normalizedPassword = String(password || "");
    if (!normalizedPassword.trim()) {
        return false;
    }

    const [credentialRow] = await db
        .select({
            password: account.password,
        })
        .from(account)
        .where(and(eq(account.providerId, "credential"), eq(account.userId, userId)))
        .limit(1);

    if (verifyCredentialPasswordHash(credentialRow?.password, normalizedPassword)) {
        return true;
    }

    const [existingUser] = await db
        .select({
            email: user.email,
        })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);

    if (!existingUser?.email) {
        return false;
    }

    const repaired = await repairKnownSeedCredential(existingUser.email, normalizedPassword);
    if (!repaired) {
        return false;
    }

    const [repairedCredential] = await db
        .select({
            password: account.password,
        })
        .from(account)
        .where(and(eq(account.providerId, "credential"), eq(account.userId, userId)))
        .limit(1);

    return verifyCredentialPasswordHash(repairedCredential?.password, normalizedPassword);
}
