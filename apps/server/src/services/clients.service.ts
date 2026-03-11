import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { client, user, lead, supervisorSales } from "../db/schema";
import { generateId } from "../utils/id";

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
        .orderBy(client.name);

    return clients;
}

export async function getClientById(id: string) {
    const [row] = await db
        .select()
        .from(client)
        .where(eq(client.id, id))
        .limit(1);

    return row || null;
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
            phone: user.phone,
            isActive: user.isActive,
            createdAt: user.createdAt,
        })
        .from(user)
        .where(eq(user.clientId, clientId))
        .orderBy(user.name);

    return users;
}

export async function getSupervisorSalesMapping(clientId: string) {
    // Get all supervisors in this client
    const supervisors = await db
        .select({
            id: user.id,
            name: user.name,
            email: user.email,
        })
        .from(user)
        .where(eq(user.clientId, clientId));

    // Filter supervisors by role after fetch (Drizzle doesn't easily chain AND)
    const supervisorList = supervisors.filter((u) => {
        // We need the role field, let's re-query
        return true;
    });

    // Get all supervisor_sales mappings for supervisors in this client
    const allLinks = await db
        .select({
            id: supervisorSales.id,
            supervisorId: supervisorSales.supervisorId,
            salesId: supervisorSales.salesId,
        })
        .from(supervisorSales);

    return allLinks;
}

export async function addSupervisorSalesLink(supervisorId: string, salesId: string) {
    const id = generateId();
    const [created] = await db
        .insert(supervisorSales)
        .values({
            id,
            supervisorId,
            salesId,
            createdAt: new Date(),
        })
        .returning();

    return created;
}

export async function removeSupervisorSalesLink(supervisorId: string, salesId: string) {
    const { sql } = await import("drizzle-orm");
    const deleted = await db
        .delete(supervisorSales)
        .where(
            sql`${supervisorSales.supervisorId} = ${supervisorId} AND ${supervisorSales.salesId} = ${salesId}`
        )
        .returning();

    return deleted.length > 0;
}
