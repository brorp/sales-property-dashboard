import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import { logger } from "../utils/logger";
import { auth } from "../auth/index";
import { db } from "./index";
import {
    account,
    activity,
    appSetting,
    appointment,
    client,
    distributionAttempt,
    distributionCycle,
    lead,
    leadProgressHistory,
    leadStatusHistory,
    salesQueue,
    session,
    supervisorSales,
    user,
    waMessage,
} from "./schema";
import { generateId } from "../utils/id";
import { normalizePhone } from "../utils/phone";

// ─── Roles ───────────────────────────────────────────────────────────────────
type UserRole = "root_admin" | "client_admin" | "supervisor" | "sales";

interface SeedUser {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    phone: string;
}

// ─── Default Client & Users ──────────────────────────────────────────────────

const DEFAULT_CLIENT_ID = "default-client";
const DEFAULT_CLIENT = {
    id: DEFAULT_CLIENT_ID,
    name: "Property Lounge",
    slug: "property-lounge",
};

const seedUsers: SeedUser[] = [
    {
        name: "Root Admin",
        email: "root@propertylounge.id",
        password: "admin123",
        role: "root_admin",
        phone: "+6280000000000",
    },
    {
        name: "Super Admin",
        email: "admin@propertylounge.id",
        password: "admin123",
        role: "client_admin",
        phone: "+6281111111111",
    },
    {
        name: "Ryan Pratama",
        email: "ryan.pratama@propertylounge.id",
        password: "sales123",
        role: "sales",
        phone: "081299001025",
    },
    {
        name: "Rachmat",
        email: "rachmat@propertylounge.id",
        password: "sales123",
        role: "sales",
        phone: "081513392028",
    },
    {
        name: "Nicky Robert",
        email: "nicky.robert@propertylounge.id",
        password: "sales123",
        role: "sales",
        phone: "085191378506",
    },
];

const shouldReset =
    process.argv.includes("--reset") ||
    String(process.env.SEED_RESET || "false").toLowerCase() === "true";

async function resetLeadsAndSalesData() {
    await db.transaction(async (tx) => {
        await tx.delete(distributionAttempt);
        await tx.delete(distributionCycle);
        await tx.delete(leadProgressHistory);
        await tx.delete(leadStatusHistory);
        await tx.delete(activity);
        await tx.delete(appointment);
        await tx.delete(waMessage);
        await tx.delete(lead);
        await tx.delete(salesQueue);
        await tx.delete(supervisorSales);

        const salesUsers = await tx
            .select({ id: user.id })
            .from(user)
            .where(eq(user.role, "sales"));
        const salesIds = salesUsers.map((item) => item.id);

        if (salesIds.length > 0) {
            await tx.delete(session).where(inArray(session.userId, salesIds));
            await tx.delete(account).where(inArray(account.userId, salesIds));
            await tx.delete(user).where(inArray(user.id, salesIds));
        }
    });
}

async function ensureDefaultClient() {
    const [existing] = await db
        .select({ id: client.id })
        .from(client)
        .where(eq(client.id, DEFAULT_CLIENT_ID))
        .limit(1);

    if (!existing) {
        const now = new Date();
        await db.insert(client).values({
            id: DEFAULT_CLIENT.id,
            name: DEFAULT_CLIENT.name,
            slug: DEFAULT_CLIENT.slug,
            isActive: true,
            createdAt: now,
            updatedAt: now,
        });
        logger.info(`  ✅ created default client "${DEFAULT_CLIENT.name}"`);
    } else {
        logger.info(`  ✅ default client already exists`);
    }
}

async function upsertAuthUser(seedUser: SeedUser) {
    const [existing] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, seedUser.email))
        .limit(1);

    // Determine clientId: root_admin has no client, everyone else belongs to default
    const clientId = seedUser.role === "root_admin" ? null : DEFAULT_CLIENT_ID;

    if (!existing) {
        let createdUserId: string | null = null;

        try {
            const result = await auth.api.signUpEmail({
                body: {
                    name: seedUser.name,
                    email: seedUser.email,
                    password: seedUser.password,
                    role: seedUser.role,
                },
            });
            createdUserId = result.user.id;
        } catch (firstError) {
            try {
                const result = await auth.api.signUpEmail({
                    body: {
                        name: seedUser.name,
                        email: seedUser.email,
                        password: seedUser.password,
                    },
                });
                createdUserId = result.user.id;
            } catch (secondError) {
                const [createdByParallelProcess] = await db
                    .select({ id: user.id })
                    .from(user)
                    .where(eq(user.email, seedUser.email))
                    .limit(1);

                if (createdByParallelProcess) {
                    createdUserId = createdByParallelProcess.id;
                } else {
                    logger.error(`❌ Failed creating user ${seedUser.email}`, {
                        firstError,
                        secondError
                    });
                    throw secondError;
                }
            }
        }

        if (!createdUserId) {
            throw new Error(`Failed to get user id after signup for ${seedUser.email}`);
        }

        await db
            .update(user)
            .set({
                role: seedUser.role,
                clientId,
                phone: normalizePhone(seedUser.phone),
                isActive: true,
                updatedAt: new Date(),
            })
            .where(eq(user.id, createdUserId));
        return createdUserId;
    }

    await db
        .update(user)
        .set({
            name: seedUser.name,
            role: seedUser.role,
            clientId,
            phone: normalizePhone(seedUser.phone),
            isActive: true,
            updatedAt: new Date(),
        })
        .where(eq(user.id, existing.id));

    return existing.id;
}

async function seedQueue(salesIds: string[]) {
    const queueLabels = ["A", "B", "C"];
    await db.delete(salesQueue);

    for (let i = 0; i < salesIds.length; i += 1) {
        const salesId = salesIds[i];
        await db.insert(salesQueue).values({
            id: generateId(),
            salesId,
            clientId: DEFAULT_CLIENT_ID,
            queueOrder: i + 1,
            label: queueLabels[i] || `Q${i + 1}`,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    }
}

async function seedSystemSettings() {
    const [existing] = await db
        .select({ id: appSetting.id })
        .from(appSetting)
        .where(eq(appSetting.id, "global"))
        .limit(1);

    if (existing) {
        return;
    }

    const now = new Date();
    await db.insert(appSetting).values({
        id: "global",
        clientId: DEFAULT_CLIENT_ID,
        distributionAckTimeoutMinutes: 5,
        operationalStartMinute: 9 * 60,
        operationalEndMinute: 21 * 60,
        operationalTimezone: "Asia/Jakarta",
        outsideOfficeReply:
            "Terima kasih sudah menghubungi kami. Jam operasional kami 09.00 - 21.00 WIB. Tim kami akan merespons saat jam operasional.",
        createdAt: now,
        updatedAt: now,
    });
}

/**
 * Migrate existing users from old role system to new:
 *   "admin" → "client_admin"
 *   "sales" stays "sales"
 * Also backfill client_id for users that don't have one.
 */
async function migrateExistingRoles() {
    // Migrate admin → client_admin
    const oldAdmins = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.role, "admin"));

    if (oldAdmins.length > 0) {
        await db
            .update(user)
            .set({ role: "client_admin", clientId: DEFAULT_CLIENT_ID, updatedAt: new Date() })
            .where(eq(user.role, "admin"));
        logger.info(`  ✅ migrated ${oldAdmins.length} admin(s) → client_admin`);
    }

    // Backfill client_id for users that don't have one (except root_admin)
    const { sql } = await import("drizzle-orm");
    await db
        .update(user)
        .set({ clientId: DEFAULT_CLIENT_ID, updatedAt: new Date() })
        .where(
            sql`${user.clientId} IS NULL AND ${user.role} != 'root_admin'`
        );

    // Backfill client_id for leads that don't have one
    await db
        .update(lead)
        .set({ clientId: DEFAULT_CLIENT_ID })
        .where(sql`${lead.clientId} IS NULL`);

    // Backfill client_id for salesQueue that don't have one
    await db
        .update(salesQueue)
        .set({ clientId: DEFAULT_CLIENT_ID })
        .where(sql`${salesQueue.clientId} IS NULL`);
}

async function seed() {
    logger.info("🌱 Seeding database...");

    if (shouldReset) {
        logger.info("🧹 Reset mode ON: clearing leads and sales...");
        await resetLeadsAndSalesData();
        logger.info("  ✅ reset complete");
    }

    // Ensure default client exists
    await ensureDefaultClient();

    // Migrate existing roles (admin → client_admin, backfill client_id)
    await migrateExistingRoles();

    const createdIdsByEmail = new Map<string, string>();

    for (const seedUser of seedUsers) {
        const userId = await upsertAuthUser(seedUser);
        createdIdsByEmail.set(seedUser.email, userId);
        logger.info(`  ✅ upsert user ${seedUser.email} (${seedUser.role})`);
    }

    const salesIds = seedUsers
        .filter((u) => u.role === "sales")
        .map((u) => createdIdsByEmail.get(u.email))
        .filter((id): id is string => Boolean(id));

    await seedQueue(salesIds);
    logger.info("  ✅ seeded fixed queue A-C");

    await seedSystemSettings();
    logger.info("  ✅ seeded system settings");

    logger.info("✨ Seed complete");
    process.exit(0);
}

seed().catch((error) => {
    logger.error("❌ Seed failed", { error });
    process.exit(1);
});
