import "dotenv/config";
import { eq } from "drizzle-orm";
import { auth } from "../auth";
import { db } from "./index";
import { activity, lead, salesQueue, user } from "./schema";
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
        name: "Sales A",
        email: "sales-a@propertylounge.id",
        password: "sales123",
        role: "sales",
        phone: "+6281110000001",
    },
    {
        name: "Sales B",
        email: "sales-b@propertylounge.id",
        password: "sales123",
        role: "sales",
        phone: "+6281110000002",
    },
    {
        name: "Sales C",
        email: "sales-c@propertylounge.id",
        password: "sales123",
        role: "sales",
        phone: "+6281110000003",
    },
    {
        name: "Sales D",
        email: "sales-d@propertylounge.id",
        password: "sales123",
        role: "sales",
        phone: "+6281110000004",
    },
    {
        name: "Sales E",
        email: "sales-e@propertylounge.id",
        password: "sales123",
        role: "sales",
        phone: "+6281110000005",
    },
    {
        name: "Sales F",
        email: "sales-f@propertylounge.id",
        password: "sales123",
        role: "sales",
        phone: "+6281110000006",
    },
];

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
            // Fallback for cases where additional field payload is rejected.
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
    const queueLabels = ["A", "B", "C", "D", "E", "F"];
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

async function seedSampleLeads(firstSalesId: string) {
    const [existing] = await db
        .select({ id: lead.id })
        .from(lead)
        .limit(1);

    if (existing) {
        return;
    }

    const now = new Date();
    const sampleLeads = [
        {
            name: "Ahmad Fauzi",
            phone: normalizePhone("081234567890"),
            source: "Meta Ads - Residensial Q1",
        },
        {
            name: "Siti Aminah",
            phone: normalizePhone("081322223333"),
            source: "Meta Ads - Promo Akhir Tahun",
        },
    ];

    for (const item of sampleLeads) {
        const leadId = generateId();
        await db.insert(lead).values({
            id: leadId,
            name: item.name,
            phone: item.phone,
            source: item.source,
            metaLeadId: null,
            entryChannel: "meta_ads",
            receivedAt: now,
            assignedTo: firstSalesId,
            clientStatus: "warm",
            progress: "new",
            createdAt: now,
            updatedAt: now,
        });

        await db.insert(activity).values({
            id: generateId(),
            leadId,
            type: "new",
            note: "Seed lead created",
            timestamp: now,
        });
    }
}

async function seed() {
    console.log("🌱 Seeding database...");

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
    console.log("  ✅ seeded fixed queue A-F");

    if (salesIds.length > 0) {
        await seedSampleLeads(salesIds[0]);
        console.log("  ✅ seeded sample leads");
    }

    console.log("✨ Seed complete");
    process.exit(0);
}

seed().catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
});
