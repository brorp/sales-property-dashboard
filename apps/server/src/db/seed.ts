import "dotenv/config";
import { rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { logger } from "../utils/logger";
import { auth } from "../auth/index";
import { ensureCredentialAccount } from "../auth/credential-account";
import { db } from "./index";
import {
    activity,
    appSetting,
    appointment,
    account,
    cancelReason,
    client,
    customerPipelineFollowUp,
    dailyTask,
    dailyTaskPenalty,
    dailyTaskPenaltySuspension,
    distributionAttempt,
    distributionCycle,
    lead,
    leadPenalty,
    leadReassignmentAudit,
    leadSourceOption,
    leadProgressHistory,
    salesDistributionSuspension,
    leadStatusHistory,
    projectUnit,
    salesQueue,
    session,
    supervisorSales,
    user,
    verification,
    waMessage,
} from "./schema";
import {
    ROOT_USER,
    TENANTS,
    TENANT_LEADS,
    TENANT_LEAD_SOURCE_OPTIONS,
    TENANT_CANCEL_REASONS,
    type SeedUser,
    type SeedLead,
} from "./seed-data";
import { generateId } from "../utils/id";
import { normalizePhone } from "../utils/phone";

const shouldReset =
    process.argv.includes("--reset") ||
    String(process.env.SEED_RESET || "false").toLowerCase() === "true";

async function resetOperationalData() {
    await db.transaction(async (tx) => {
        await tx.delete(distributionAttempt);
        await tx.delete(distributionCycle);
        await tx.delete(leadProgressHistory);
        await tx.delete(leadStatusHistory);
        await tx.delete(leadReassignmentAudit);
        await tx.delete(leadPenalty);
        await tx.delete(salesDistributionSuspension);
        await tx.delete(dailyTaskPenaltySuspension);
        await tx.delete(dailyTaskPenalty);
        await tx.delete(dailyTask);
        await tx.delete(customerPipelineFollowUp);
        await tx.delete(activity);
        await tx.delete(appointment);
        await tx.delete(waMessage);
        await tx.delete(lead);
        await tx.delete(cancelReason);
        await tx.delete(leadSourceOption);
        await tx.delete(salesQueue);
        await tx.delete(supervisorSales);
        await tx.delete(appSetting);
        await tx.delete(projectUnit);
        await tx.delete(verification);
        await tx.delete(session);
        await tx.delete(account);
        await tx.delete(user);
        await tx.delete(client);
    });

    const waQrAuthPath = process.env.WA_QR_AUTH_PATH || ".wa-qr-auth";
    await rm(waQrAuthPath, { recursive: true, force: true }).catch(() => {});
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
                apiPrefix: tenant.apiPrefix || "",
                isActive: true,
                createdAt: now,
                updatedAt: now,
            });
            logger.info(`  ✅ created client ${tenant.name}`);
        } else {
            await db.update(client)
                .set({ apiPrefix: tenant.apiPrefix || "", updatedAt: new Date() })
                .where(eq(client.id, tenant.id));
            logger.info(`  🔄 updated client ${tenant.name} apiPrefix`);
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

        await ensureCredentialAccount(createdUserId, seedUser.password);

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

    await ensureCredentialAccount(existing.id, seedUser.password);

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
        insideOfficeReply:
            "Harap menunggu agent professional akan menghubungi anda",
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

async function seedLeadSourceOptions() {
    await db.delete(leadSourceOption);

    for (const tenant of TENANTS) {
        const options = TENANT_LEAD_SOURCE_OPTIONS[tenant.id] || [];
        for (const value of options) {
            await db.insert(leadSourceOption).values({
                id: generateId(),
                clientId: tenant.id,
                value,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        }
    }
}

async function seedCancelReasons() {
    await db.delete(cancelReason);

    for (const tenant of TENANTS) {
        const reasons = TENANT_CANCEL_REASONS[tenant.id] || [];
        for (const reason of reasons) {
            await db.insert(cancelReason).values({
                id: generateId(),
                clientId: tenant.id,
                code: reason.code,
                label: reason.label,
                isActive: true,
                sortOrder: reason.sortOrder,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        }
    }
}

function resolveReceivedAt(offsetDays?: number) {
    const now = new Date();
    if (!Number.isFinite(Number(offsetDays))) {
        return now;
    }

    const value = new Date(now);
    value.setDate(value.getDate() - Number(offsetDays || 0));
    value.setHours(9, 0, 0, 0);
    return value;
}

async function upsertSeedLead(seedLead: SeedLead, emailToId: Map<string, string>, keyToEmail: Map<string, string>) {
    const assignedToEmail = keyToEmail.get(seedLead.assignedToKey || "");
    const assignedTo = assignedToEmail ? emailToId.get(assignedToEmail) || null : null;
    if (!assignedTo) {
        logger.warn(`  ⚠️ skipped lead ${seedLead.key}: assigned sales not found`);
        return;
    }

    const metaLeadId = `seed-${seedLead.key}`;
    const receivedAt = resolveReceivedAt(seedLead.receivedAtOffsetDays);
    const payload = {
        name: seedLead.name,
        phone: normalizePhone(seedLead.phone),
        source: seedLead.source,
        metaLeadId,
        entryChannel: "manual_seed",
        receivedAt,
        clientId: seedLead.clientId,
        assignedTo,
        flowStatus: seedLead.flowStatus || "accepted",
        acceptedAt: (seedLead.flowStatus || "accepted") === "accepted" ? receivedAt : null,
        salesStatus: seedLead.salesStatus,
        interestProjectType: seedLead.interestProjectType,
        interestUnitName: seedLead.interestUnitName,
        resultStatus: seedLead.resultStatus,
        unitName: seedLead.unitName || seedLead.interestUnitName,
        clientStatus: seedLead.clientStatus || seedLead.salesStatus || "warm",
        layer2Status: seedLead.layer2Status || "prospecting",
        rejectedReason: seedLead.rejectedReason || null,
        rejectedNote: seedLead.rejectedNote || null,
        progress: seedLead.progress || "pending",
        updatedAt: new Date(),
    };

    const [existing] = await db
        .select({ id: lead.id })
        .from(lead)
        .where(eq(lead.metaLeadId, metaLeadId))
        .limit(1);

    if (existing) {
        await db.update(lead).set(payload).where(eq(lead.id, existing.id));
        return;
    }

    await db.insert(lead).values({
        id: generateId(),
        createdAt: receivedAt,
        ...payload,
    });
}

async function seedDemoLeads(emailToId: Map<string, string>, keyToEmail: Map<string, string>) {
    for (const tenant of TENANTS) {
        const tenantLeads = TENANT_LEADS[tenant.id] || [];
        for (const seedLead of tenantLeads) {
            await upsertSeedLead(seedLead, emailToId, keyToEmail);
        }
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

    await seedLeadSourceOptions();
    logger.info("  ✅ seeded lead source options");

    await seedCancelReasons();
    logger.info("  ✅ seeded cancel reasons");

    await seedDemoLeads(emailToId, keyToEmail);
    logger.info("  ✅ seeded demo transaction leads");

    logger.info("✨ Seed complete");
    process.exit(0);
}

seed().catch((error) => {
    logger.error("❌ Seed failed", { error });
    process.exit(1);
});
