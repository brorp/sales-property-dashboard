import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/index";
import { client, user } from "../db/schema";
import { generateId } from "../utils/id";

export type PublicAppContext = {
    siteType: "master" | "client";
    host: string | null;
    siteLabel: string;
    siteDescription: string;
    tenant: null | {
        id: string;
        slug: string;
        name: string;
        isActive: boolean;
    };
    whatsapp: {
        provider: string;
        mode: "shared_single_client" | "cloud_api" | "dummy";
        activeClientSlug: string | null;
        activeClientId: string | null;
        activeClientName: string | null;
    };
};

const MASTER_SITE_ALIASES = new Set(["master", "www", "app", "localhost"]);

function normalizeHost(input?: string | null) {
    if (!input) {
        return null;
    }

    const trimmed = String(input).trim().toLowerCase();
    if (!trimmed) {
        return null;
    }

    return trimmed.replace(/:\d+$/, "");
}

function parseRootDomains() {
    return String(
        process.env.APP_ROOT_DOMAINS ||
        process.env.CORS_ROOT_DOMAINS ||
        "propertylounge-cms.com"
    )
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .map((item) => item.replace(/^\*\./, ""))
        .map((item) => item.replace(/\.+$/, ""));
}

function parseActiveWhatsAppClientSlug() {
    const raw = String(process.env.WA_ACTIVE_CLIENT_SLUG || "").trim().toLowerCase();
    return raw || null;
}

function getWhatsAppMode(): PublicAppContext["whatsapp"]["mode"] {
    const provider = String(process.env.WA_PROVIDER || "dummy").toLowerCase();
    if (provider === "cloud_api") {
        return "cloud_api";
    }
    if (provider === "qr_local") {
        return "shared_single_client";
    }
    return "dummy";
}

function extractTenantSlugFromHost(host: string | null) {
    if (!host) {
        return null;
    }

    if (host === "127.0.0.1" || host === "::1") {
        return null;
    }

    const rootDomains = parseRootDomains();
    for (const rootDomain of rootDomains) {
        if (host === rootDomain) {
            return null;
        }

        if (host.endsWith(`.${rootDomain}`)) {
            const withoutRoot = host.slice(0, -(`.${rootDomain}`).length);
            const labels = withoutRoot.split(".").filter(Boolean);
            const firstLabel = labels[0] || null;
            if (!firstLabel || MASTER_SITE_ALIASES.has(firstLabel)) {
                return null;
            }
            return firstLabel;
        }
    }

    if (!host.includes(".")) {
        return null;
    }

    const firstLabel = host.split(".")[0] || null;
    if (!firstLabel || MASTER_SITE_ALIASES.has(firstLabel)) {
        return null;
    }

    return firstLabel;
}

export async function listClients() {
    const clients = await db
        .select({
            id: client.id,
            name: client.name,
            slug: client.slug,
            isActive: client.isActive,
            createdAt: client.createdAt,
            updatedAt: client.updatedAt,
        })
        .from(client)
        .orderBy(asc(client.name));

    const users = await db
        .select({
            clientId: user.clientId,
            role: user.role,
        })
        .from(user);

    return clients.map((item) => {
        const scopedUsers = users.filter((row) => row.clientId === item.id);
        return {
            ...item,
            totalClientAdmins: scopedUsers.filter((row) => row.role === "client_admin").length,
            totalSupervisors: scopedUsers.filter((row) => row.role === "supervisor").length,
            totalSales: scopedUsers.filter((row) => row.role === "sales").length,
        };
    });
}

export async function getClientById(id: string) {
    const [row] = await db
        .select()
        .from(client)
        .where(eq(client.id, id))
        .limit(1);

    return row || null;
}

export async function getClientBySlug(slug: string) {
    const [row] = await db
        .select()
        .from(client)
        .where(eq(client.slug, slug))
        .limit(1);

    return row || null;
}

export async function resolvePublicAppContext(params?: {
    host?: string | null;
    slug?: string | null;
}): Promise<PublicAppContext> {
    const normalizedHost = normalizeHost(params?.host || null);
    const tenantSlug =
        (params?.slug ? String(params.slug).trim().toLowerCase() : "") ||
        extractTenantSlugFromHost(normalizedHost);

    const activeClientSlug = parseActiveWhatsAppClientSlug();
    const activeClient = activeClientSlug ? await getClientBySlug(activeClientSlug) : null;

    const whatsapp = {
        provider: String(process.env.WA_PROVIDER || "dummy").toLowerCase(),
        mode: getWhatsAppMode(),
        activeClientSlug,
        activeClientId: activeClient?.id || null,
        activeClientName: activeClient?.name || null,
    } satisfies PublicAppContext["whatsapp"];

    if (!tenantSlug) {
        return {
            siteType: "master",
            host: normalizedHost,
            siteLabel: "Property Lounge Master",
            siteDescription: "Master dashboard for all property developer clients.",
            tenant: null,
            whatsapp,
        };
    }

    const tenant = await getClientBySlug(tenantSlug);
    if (!tenant) {
        return {
            siteType: "master",
            host: normalizedHost,
            siteLabel: "Property Lounge Master",
            siteDescription: "Master dashboard for all property developer clients.",
            tenant: null,
            whatsapp,
        };
    }

    return {
        siteType: "client",
        host: normalizedHost,
        siteLabel: tenant.name,
        siteDescription: `${tenant.name} dashboard on the shared Property Lounge platform.`,
        tenant: {
            id: tenant.id,
            slug: tenant.slug,
            name: tenant.name,
            isActive: tenant.isActive,
        },
        whatsapp,
    };
}

export async function createClient(data: { name: string; slug: string }) {
    const id = generateId();
    const now = new Date();

    const [created] = await db
        .insert(client)
        .values({
            id,
            name: data.name,
            slug: data.slug,
            isActive: true,
            createdAt: now,
            updatedAt: now,
        })
        .returning();

    return created;
}

export async function updateClient(
    id: string,
    data: { name?: string; slug?: string; isActive?: boolean }
) {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) updates.name = data.name;
    if (data.slug !== undefined) updates.slug = data.slug;
    if (data.isActive !== undefined) updates.isActive = data.isActive;

    const [updated] = await db
        .update(client)
        .set(updates)
        .where(eq(client.id, id))
        .returning();

    return updated || null;
}

export async function getClientUsers(clientId: string) {
    const users = await db
        .select({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            clientId: user.clientId,
            supervisorId: user.supervisorId,
            createdByUserId: user.createdByUserId,
            phone: user.phone,
            isActive: user.isActive,
            createdAt: user.createdAt,
        })
        .from(user)
        .where(eq(user.clientId, clientId))
        .orderBy(asc(user.role), asc(user.name));

    return users;
}

export async function getSupervisorSalesMapping(clientId: string) {
    const salesRows = await db
        .select({
            salesId: user.id,
            salesName: user.name,
            supervisorId: user.supervisorId,
        })
        .from(user)
        .where(and(eq(user.clientId, clientId), eq(user.role, "sales")));

    return salesRows
        .filter((row) => Boolean(row.supervisorId))
        .map((row) => ({
            id: `${row.supervisorId}:${row.salesId}`,
            supervisorId: row.supervisorId!,
            salesId: row.salesId,
            salesName: row.salesName,
        }));
}

export async function assignSalesSupervisor(params: {
    clientId: string;
    supervisorId: string;
    salesId: string;
}) {
    const [supervisorRow] = await db
        .select({
            id: user.id,
            role: user.role,
            clientId: user.clientId,
            isActive: user.isActive,
        })
        .from(user)
        .where(eq(user.id, params.supervisorId))
        .limit(1);

    const [salesRow] = await db
        .select({
            id: user.id,
            role: user.role,
            clientId: user.clientId,
            isActive: user.isActive,
        })
        .from(user)
        .where(eq(user.id, params.salesId))
        .limit(1);

    if (!supervisorRow || !salesRow) {
        throw new Error("USER_NOT_FOUND");
    }

    if (supervisorRow.role !== "supervisor" || salesRow.role !== "sales") {
        throw new Error("INVALID_ROLE_RELATION");
    }

    if (
        supervisorRow.clientId !== params.clientId ||
        salesRow.clientId !== params.clientId
    ) {
        throw new Error("CROSS_CLIENT_ASSIGNMENT_FORBIDDEN");
    }

    const [updated] = await db
        .update(user)
        .set({
            supervisorId: params.supervisorId,
            updatedAt: new Date(),
        })
        .where(eq(user.id, params.salesId))
        .returning({
            id: user.id,
            supervisorId: user.supervisorId,
        });

    return updated;
}

export async function removeSupervisorSalesLink(params: {
    clientId: string;
    supervisorId: string;
    salesId: string;
}) {
    const [salesRow] = await db
        .select({
            id: user.id,
            clientId: user.clientId,
            supervisorId: user.supervisorId,
            role: user.role,
        })
        .from(user)
        .where(eq(user.id, params.salesId))
        .limit(1);

    if (!salesRow || salesRow.role !== "sales" || salesRow.clientId !== params.clientId) {
        return false;
    }

    if (salesRow.supervisorId !== params.supervisorId) {
        return false;
    }

    const updated = await db
        .update(user)
        .set({
            supervisorId: null,
            updatedAt: new Date(),
        })
        .where(eq(user.id, params.salesId))
        .returning({ id: user.id });

    return updated.length > 0;
}
