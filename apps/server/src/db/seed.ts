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

type UserRole = "root_admin" | "client_admin" | "supervisor" | "sales";

type SeedUser = {
    key: string;
    name: string;
    email: string;
    password: string;
    role: UserRole;
    phone: string;
    clientId?: string | null;
    createdByKey?: string;
    supervisorKey?: string;
};

type SeedClient = {
    id: string;
    name: string;
    slug: string;
    users: SeedUser[];
};

const ROOT_USER: SeedUser = {
    key: "root",
    name: "Root Admin",
    email: "root@propertylounge.id",
    password: "admin123",
    role: "root_admin",
    phone: "+6280000000000",
    clientId: null,
};

const TENANTS: SeedClient[] = [
    {
        id: "widari",
        name: "Widari",
        slug: "widari",
        users: [
            {
                key: "widari-admin",
                name: "Widari Admin",
                email: "admin@widari.propertylounge.id",
                password: "admin123",
                role: "client_admin",
                phone: "+6281111111101",
                createdByKey: "root",
            },
            {
                key: "widari-sup-a",
                name: "Supervisor Widari A",
                email: "supervisor.a@widari.propertylounge.id",
                password: "admin123",
                role: "supervisor",
                phone: "+6281211111101",
                createdByKey: "widari-admin",
            },
            {
                key: "widari-sup-b",
                name: "Supervisor Widari B",
                email: "supervisor.b@widari.propertylounge.id",
                password: "admin123",
                role: "supervisor",
                phone: "+6281211111102",
                createdByKey: "widari-admin",
            },
            {
                key: "widari-sales-anto",
                name: "Anto Widari",
                email: "anto@widari.propertylounge.id",
                password: "sales123",
                role: "sales",
                phone: "081111111101",
                createdByKey: "widari-sup-a",
                supervisorKey: "widari-sup-a",
            },
            {
                key: "widari-sales-andi",
                name: "Andi Widari",
                email: "andi@widari.propertylounge.id",
                password: "sales123",
                role: "sales",
                phone: "081111111102",
                createdByKey: "widari-sup-a",
                supervisorKey: "widari-sup-a",
            },
            {
                key: "widari-sales-rudi",
                name: "Rudi Widari",
                email: "rudi@widari.propertylounge.id",
                password: "sales123",
                role: "sales",
                phone: "081111111103",
                createdByKey: "widari-sup-a",
                supervisorKey: "widari-sup-a",
            },
            {
                key: "widari-sales-beni",
                name: "Beni Widari",
                email: "beni@widari.propertylounge.id",
                password: "sales123",
                role: "sales",
                phone: "081111111104",
                createdByKey: "widari-sup-b",
                supervisorKey: "widari-sup-b",
            },
            {
                key: "widari-sales-dika",
                name: "Dika Widari",
                email: "dika@widari.propertylounge.id",
                password: "sales123",
                role: "sales",
                phone: "081111111105",
                createdByKey: "widari-sup-b",
                supervisorKey: "widari-sup-b",
            },
        ],
    },
    {
        id: "aryana",
        name: "Aryana",
        slug: "aryana",
        users: [
            {
                key: "aryana-admin",
                name: "Aryana Admin",
                email: "admin@aryana.propertylounge.id",
                password: "admin123",
                role: "client_admin",
                phone: "+6281111111201",
                createdByKey: "root",
            },
            {
                key: "aryana-sup-c",
                name: "Supervisor Aryana C",
                email: "supervisor.c@aryana.propertylounge.id",
                password: "admin123",
                role: "supervisor",
                phone: "+6281211111201",
                createdByKey: "aryana-admin",
            },
            {
                key: "aryana-sup-d",
                name: "Supervisor Aryana D",
                email: "supervisor.d@aryana.propertylounge.id",
                password: "admin123",
                role: "supervisor",
                phone: "+6281211111202",
                createdByKey: "aryana-admin",
            },
            {
                key: "aryana-sales-1",
                name: "Sales Aryana 1",
                email: "sales1@aryana.propertylounge.id",
                password: "sales123",
                role: "sales",
                phone: "081111111201",
                createdByKey: "aryana-sup-c",
                supervisorKey: "aryana-sup-c",
            },
            {
                key: "aryana-sales-2",
                name: "Sales Aryana 2",
                email: "sales2@aryana.propertylounge.id",
                password: "sales123",
                role: "sales",
                phone: "081111111202",
                createdByKey: "aryana-sup-c",
                supervisorKey: "aryana-sup-c",
            },
        ],
    },
    {
        id: "agung-sedayu",
        name: "Agung Sedayu",
        slug: "agung-sedayu",
        users: [
            {
                key: "agung-admin",
                name: "Agung Sedayu Admin",
                email: "admin@agungsedayu.propertylounge.id",
                password: "admin123",
                role: "client_admin",
                phone: "+6281111111301",
                createdByKey: "root",
            },
            {
                key: "agung-sup-e",
                name: "Supervisor Agung E",
                email: "supervisor.e@agungsedayu.propertylounge.id",
                password: "admin123",
                role: "supervisor",
                phone: "+6281211111301",
                createdByKey: "agung-admin",
            },
            {
                key: "agung-sup-f",
                name: "Supervisor Agung F",
                email: "supervisor.f@agungsedayu.propertylounge.id",
                password: "admin123",
                role: "supervisor",
                phone: "+6281211111302",
                createdByKey: "agung-admin",
            },
            {
                key: "agung-sales-1",
                name: "Sales Agung 1",
                email: "sales1@agungsedayu.propertylounge.id",
                password: "sales123",
                role: "sales",
                phone: "081111111301",
                createdByKey: "agung-sup-e",
                supervisorKey: "agung-sup-e",
            },
            {
                key: "agung-sales-2",
                name: "Sales Agung 2",
                email: "sales2@agungsedayu.propertylounge.id",
                password: "sales123",
                role: "sales",
                phone: "081111111302",
                createdByKey: "agung-sup-f",
                supervisorKey: "agung-sup-f",
            },
        ],
    },
];

const shouldReset =
    process.argv.includes("--reset") ||
    String(process.env.SEED_RESET || "false").toLowerCase() === "true";

async function resetOperationalData() {
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
    });
}

async function ensureClients() {
    for (const tenant of TENANTS) {
        const [existing] = await db
            .select({ id: client.id })
            .from(client)
            .where(eq(client.id, tenant.id))
            .limit(1);

        if (!existing) {
            const now = new Date();
            await db.insert(client).values({
                id: tenant.id,
                name: tenant.name,
                slug: tenant.slug,
                isActive: true,
                createdAt: now,
                updatedAt: now,
            });
            logger.info(`  ✅ created client ${tenant.name}`);
        }
    }
}

async function upsertAuthUser(seedUser: SeedUser, resolved: {
    clientId: string | null;
    supervisorId: string | null;
    createdByUserId: string | null;
}) {
    const [existing] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, seedUser.email))
        .limit(1);

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
                logger.error(`❌ Failed creating user ${seedUser.email}`, {
                    firstError,
                    secondError,
                });
                throw secondError;
            }
        }

        if (!createdUserId) {
            throw new Error(`Failed to get user id for ${seedUser.email}`);
        }

        await db
            .update(user)
            .set({
                role: seedUser.role,
                clientId: resolved.clientId,
                supervisorId: resolved.supervisorId,
                createdByUserId: resolved.createdByUserId,
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
            clientId: resolved.clientId,
            supervisorId: resolved.supervisorId,
            createdByUserId: resolved.createdByUserId,
            phone: normalizePhone(seedUser.phone),
            isActive: true,
            updatedAt: new Date(),
        })
        .where(eq(user.id, existing.id));

    return existing.id;
}

async function seedQueues(emailToId: Map<string, string>) {
    await db.delete(salesQueue);

    for (const tenant of TENANTS) {
        const salesUsers = tenant.users
            .filter((item) => item.role === "sales")
            .map((item) => emailToId.get(item.email))
            .filter((id): id is string => Boolean(id));

        for (let i = 0; i < salesUsers.length; i += 1) {
            await db.insert(salesQueue).values({
                id: generateId(),
                salesId: salesUsers[i],
                clientId: tenant.id,
                queueOrder: i + 1,
                label: String.fromCharCode(65 + i),
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        }
    }
}

async function syncLegacySupervisorLinks(emailToId: Map<string, string>) {
    await db.delete(supervisorSales);

    for (const tenant of TENANTS) {
        for (const seedUser of tenant.users.filter((item) => item.role === "sales" && item.supervisorKey)) {
            const supervisor = tenant.users.find((item) => item.key === seedUser.supervisorKey);
            if (!supervisor) {
                continue;
            }

            const supervisorId = emailToId.get(supervisor.email);
            const salesId = emailToId.get(seedUser.email);
            if (!supervisorId || !salesId) {
                continue;
            }

            await db.insert(supervisorSales).values({
                id: generateId(),
                supervisorId,
                salesId,
                createdAt: new Date(),
            });
        }
    }
}

async function upsertSettingsRow(id: string, clientId: string | null) {
    const [existing] = await db
        .select({ id: appSetting.id })
        .from(appSetting)
        .where(eq(appSetting.id, id))
        .limit(1);

    const payload = {
        id,
        clientId,
        distributionAckTimeoutMinutes: 5,
        operationalStartMinute: 9 * 60,
        operationalEndMinute: 21 * 60,
        operationalTimezone: "Asia/Jakarta",
        outsideOfficeReply:
            "Terima kasih sudah menghubungi kami. Jam operasional kami 09.00 - 21.00 WIB. Tim kami akan merespons saat jam operasional.",
        updatedAt: new Date(),
    };

    if (existing) {
        await db.update(appSetting).set(payload).where(eq(appSetting.id, id));
        return;
    }

    await db.insert(appSetting).values({
        ...payload,
        createdAt: new Date(),
    });
}

async function seedSystemSettings() {
    await upsertSettingsRow("global", null);

    for (const tenant of TENANTS) {
        await upsertSettingsRow(`client:${tenant.id}`, tenant.id);
    }
}

async function seed() {
    logger.info("🌱 Seeding hierarchical multi-tenant database...");

    if (shouldReset) {
        logger.info("🧹 Reset mode ON: clearing operational data...");
        await resetOperationalData();
        logger.info("  ✅ operational data cleared");
    }

    await ensureClients();

    const emailToId = new Map<string, string>();
    const keyToEmail = new Map<string, string>();
    keyToEmail.set(ROOT_USER.key, ROOT_USER.email);
    for (const tenant of TENANTS) {
        for (const seedUser of tenant.users) {
            keyToEmail.set(seedUser.key, seedUser.email);
        }
    }

    const rootId = await upsertAuthUser(ROOT_USER, {
        clientId: null,
        supervisorId: null,
        createdByUserId: null,
    });
    emailToId.set(ROOT_USER.email, rootId);
    logger.info(`  ✅ upsert user ${ROOT_USER.email} (${ROOT_USER.role})`);

    for (const tenant of TENANTS) {
        for (const seedUser of tenant.users.filter((item) => item.role === "client_admin")) {
            const userId = await upsertAuthUser(seedUser, {
                clientId: tenant.id,
                supervisorId: null,
                createdByUserId: rootId,
            });
            emailToId.set(seedUser.email, userId);
            logger.info(`  ✅ upsert user ${seedUser.email} (${seedUser.role})`);
        }

        for (const seedUser of tenant.users.filter((item) => item.role === "supervisor")) {
            const creatorEmail = keyToEmail.get(seedUser.createdByKey || "");
            const createdByUserId = creatorEmail ? emailToId.get(creatorEmail) || null : null;
            const userId = await upsertAuthUser(seedUser, {
                clientId: tenant.id,
                supervisorId: null,
                createdByUserId,
            });
            emailToId.set(seedUser.email, userId);
            logger.info(`  ✅ upsert user ${seedUser.email} (${seedUser.role})`);
        }

        for (const seedUser of tenant.users.filter((item) => item.role === "sales")) {
            const creatorEmail = keyToEmail.get(seedUser.createdByKey || "");
            const supervisorEmail = keyToEmail.get(seedUser.supervisorKey || "");
            const createdByUserId = creatorEmail ? emailToId.get(creatorEmail) || null : null;
            const supervisorId = supervisorEmail ? emailToId.get(supervisorEmail) || null : null;
            const userId = await upsertAuthUser(seedUser, {
                clientId: tenant.id,
                supervisorId,
                createdByUserId,
            });
            emailToId.set(seedUser.email, userId);
            logger.info(`  ✅ upsert user ${seedUser.email} (${seedUser.role})`);
        }
    }

    await seedQueues(emailToId);
    logger.info("  ✅ seeded queue per client");

    await syncLegacySupervisorLinks(emailToId);
    logger.info("  ✅ synced legacy supervisor mapping");

    await seedSystemSettings();
    logger.info("  ✅ seeded system settings");

    logger.info("✨ Seed complete");
    process.exit(0);
}

seed().catch((error) => {
    logger.error("❌ Seed failed", { error });
    process.exit(1);
});
