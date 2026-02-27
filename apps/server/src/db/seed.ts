import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import { auth } from "../auth";
import { db } from "./index";
import {
    account,
    activity,
    appSetting,
    appointment,
    distributionAttempt,
    distributionCycle,
    lead,
    leadProgressHistory,
    leadStatusHistory,
    salesQueue,
    session,
    user,
    waMessage,
} from "./schema";
import { generateId } from "../utils/id";
import { normalizePhone } from "../utils/phone";

interface SeedUser {
    name: string;
    email: string;
    password: string;
    role: "admin" | "sales";
    phone: string;
}

const seedUsers: SeedUser[] = [
    {
        name: "Super Admin",
        email: "admin@propertylounge.id",
        password: "admin123",
        role: "admin",
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

async function upsertAuthUser(seedUser: SeedUser) {
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
                const [createdByParallelProcess] = await db
                    .select({ id: user.id })
                    .from(user)
                    .where(eq(user.email, seedUser.email))
                    .limit(1);

                if (createdByParallelProcess) {
                    createdUserId = createdByParallelProcess.id;
                } else {
                    console.error(
                        `❌ Failed creating user ${seedUser.email}`,
                        firstError,
                        secondError
                    );
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

async function seed() {
    console.log("🌱 Seeding database...");

    if (shouldReset) {
        console.log("🧹 Reset mode ON: clearing leads and sales...");
        await resetLeadsAndSalesData();
        console.log("  ✅ reset complete");
    }

    const createdIdsByEmail = new Map<string, string>();

    for (const seedUser of seedUsers) {
        const userId = await upsertAuthUser(seedUser);
        createdIdsByEmail.set(seedUser.email, userId);
        console.log(`  ✅ upsert user ${seedUser.email}`);
    }

    const salesIds = seedUsers
        .filter((u) => u.role === "sales")
        .map((u) => createdIdsByEmail.get(u.email))
        .filter((id): id is string => Boolean(id));

    await seedQueue(salesIds);
    console.log("  ✅ seeded fixed queue A-C");

    await seedSystemSettings();
    console.log("  ✅ seeded system settings");

    console.log("✨ Seed complete");
    process.exit(0);
}

seed().catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
});
