import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import * as clientsService from "../services/clients.service";
import { auth } from "../auth/index";
import { ensureCredentialAccount } from "../auth/credential-account";
import { db } from "../db/index";
import { user } from "../db/schema";
import { eq } from "drizzle-orm";
import { normalizePhone } from "../utils/phone";

const router: ReturnType<typeof Router> = Router();

// ─── Root Admin: Manage Clients ──────────────────────────────────────────────

router.get("/", requireRole("root_admin") as any, async (_req, res: Response, next: NextFunction) => {
    try {
        const clients = await clientsService.listClients();
        res.json(clients);
    } catch (error) {
        next(error);
    }
});

router.post("/", requireRole("root_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { name, slug } = req.body ?? {};
        if (!name || !slug) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "name dan slug wajib diisi" });
            return;
        }

        const created = await clientsService.createClient({ name, slug });
        res.status(201).json(created);
    } catch (error) {
        next(error);
    }
});

router.patch("/:id", requireRole("root_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { name, slug, isActive } = req.body ?? {};
        const updated = await clientsService.updateClient(req.params.id, { name, slug, isActive });
        if (!updated) {
            res.status(404).json({ error: "NOT_FOUND", message: "Client tidak ditemukan" });
            return;
        }
        res.json(updated);
    } catch (error) {
        next(error);
    }
});

router.get("/:id", requireRole("root_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const clientData = await clientsService.getClientById(req.params.id);
        if (!clientData) {
            res.status(404).json({ error: "NOT_FOUND", message: "Client tidak ditemukan" });
            return;
        }
        res.json(clientData);
    } catch (error) {
        next(error);
    }
});

// ─── Root Admin + Client Admin: Users within a client ────────────────────────

router.get("/:id/users", requireRole("root_admin", "client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const users = await clientsService.getClientUsers(req.params.id);
        res.json(users);
    } catch (error) {
        next(error);
    }
});

router.post("/:id/users", requireRole("root_admin", "client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user: reqUser } = req as unknown as AuthenticatedRequest;
        const clientId = req.params.id;

        const { name, email, password, role, phone, supervisorId } = req.body ?? {};
        if (!name || !email || !password || !role) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "name, email, password, role wajib diisi" });
            return;
        }

        // Validate role: root_admin can create any role, client_admin can create supervisor/sales
        const allowedRoles = reqUser.role === "root_admin"
            ? ["client_admin", "supervisor", "sales"]
            : ["supervisor", "sales"];

        if (!allowedRoles.includes(role)) {
            res.status(400).json({ error: "INVALID_ROLE", message: `Role yang diizinkan: ${allowedRoles.join(", ")}` });
            return;
        }

        if (role === "sales" && supervisorId) {
            const [supervisorRow] = await db
                .select({
                    id: user.id,
                    role: user.role,
                    clientId: user.clientId,
                })
                .from(user)
                .where(eq(user.id, supervisorId))
                .limit(1);

            if (!supervisorRow || supervisorRow.role !== "supervisor") {
                res.status(400).json({ error: "INVALID_SUPERVISOR", message: "supervisorId tidak valid untuk client ini" });
                return;
            }
        }

        // Create user via Better Auth
        let createdUserId: string | null = null;
        try {
            const result = await auth.api.signUpEmail({
                body: { name, email, password, role },
            });
            createdUserId = result.user.id;
        } catch {
            try {
                const result = await auth.api.signUpEmail({
                    body: { name, email, password },
                });
                createdUserId = result.user.id;
            } catch {
                res.status(409).json({ error: "EMAIL_ALREADY_EXISTS", message: "Email sudah terdaftar" });
                return;
            }
        }

        // Update role and clientId
        await db
            .update(user)
            .set({
                role,
                clientId,
                supervisorId: role === "sales" ? supervisorId || null : null,
                createdByUserId: reqUser.id,
                phone: phone ? normalizePhone(phone) : null,
                isActive: true,
                updatedAt: new Date(),
            })
            .where(eq(user.id, createdUserId!));

        const [fullUser] = await db
            .select({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                clientId: user.clientId,
                supervisorId: user.supervisorId,
                phone: user.phone,
                isActive: user.isActive,
            })
            .from(user)
            .where(eq(user.id, createdUserId!))
            .limit(1);

        res.status(201).json(fullUser);
    } catch (error) {
        next(error);
    }
});

router.patch("/:id/users/:userId", requireRole("root_admin", "client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const clientId = req.params.id;

        const [targetUser] = await db
            .select({
                id: user.id,
                role: user.role,
                clientId: user.clientId,
            })
            .from(user)
            .where(eq(user.id, req.params.userId))
            .limit(1);

        if (!targetUser) {
            res.status(404).json({ error: "NOT_FOUND", message: "User tidak ditemukan" });
            return;
        }

        const { name, phone, isActive, supervisorId, email, password } = req.body ?? {};
        const updates: Record<string, unknown> = {
            updatedAt: new Date(),
        };

        if (typeof name === "string" && name.trim()) {
            updates.name = name.trim();
        }
        if (typeof phone === "string" || phone === null) {
            updates.phone = phone ? normalizePhone(phone) : null;
        }
        if (typeof email === "string" && email.trim()) {
            const normalizedEmail = email.trim().toLowerCase();
            const [emailOwner] = await db
                .select({
                    id: user.id,
                })
                .from(user)
                .where(eq(user.email, normalizedEmail))
                .limit(1);

            if (emailOwner && emailOwner.id !== targetUser.id) {
                res.status(409).json({ error: "EMAIL_ALREADY_EXISTS", message: "Email sudah dipakai user lain" });
                return;
            }

            updates.email = normalizedEmail;
        }
        if (typeof isActive === "boolean") {
            updates.isActive = isActive;
        }

        if (targetUser.role === "sales" && supervisorId !== undefined) {
            if (supervisorId === null || supervisorId === "") {
                updates.supervisorId = null;
            } else {
                const [supervisorRow] = await db
                    .select({
                        id: user.id,
                        role: user.role,
                        clientId: user.clientId,
                    })
                    .from(user)
                    .where(eq(user.id, supervisorId))
                    .limit(1);

                if (!supervisorRow || supervisorRow.role !== "supervisor") {
                    res.status(400).json({ error: "INVALID_SUPERVISOR", message: "supervisorId tidak valid untuk client ini" });
                    return;
                }

                updates.supervisorId = supervisorId;
            }
        }

        const [updated] = await db
            .update(user)
            .set(updates)
            .where(eq(user.id, req.params.userId))
            .returning({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                clientId: user.clientId,
                supervisorId: user.supervisorId,
                phone: user.phone,
                isActive: user.isActive,
            });

        if (typeof password === "string" && password.trim()) {
            await ensureCredentialAccount(req.params.userId, password);
        }

        res.json(updated);
    } catch (error) {
        next(error);
    }
});

router.delete("/:id/users/:userId", requireRole("root_admin", "client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const [updated] = await db
            .update(user)
            .set({
                isActive: false,
                updatedAt: new Date(),
            })
            .where(eq(user.id, req.params.userId))
            .returning({
                id: user.id,
                isActive: user.isActive,
            });

        if (!updated) {
            res.status(404).json({ error: "NOT_FOUND", message: "User tidak ditemukan" });
            return;
        }

        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

// ─── Supervisor-Sales Mapping ────────────────────────────────────────────────

router.get("/:id/supervisor-sales", requireRole("root_admin", "client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const links = await clientsService.getSupervisorSalesMapping(req.params.id);
        res.json(links);
    } catch (error) {
        next(error);
    }
});

router.post("/:id/supervisor-sales", requireRole("root_admin", "client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { supervisorId, salesId } = req.body ?? {};
        if (!supervisorId || !salesId) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "supervisorId dan salesId wajib diisi" });
            return;
        }

        const link = await clientsService.assignSalesSupervisor({
            clientId: req.params.id,
            supervisorId,
            salesId,
        });
        res.status(201).json(link);
    } catch (error) {
        next(error);
    }
});

router.delete("/:id/supervisor-sales", requireRole("root_admin", "client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { supervisorId, salesId } = req.body ?? {};
        if (!supervisorId || !salesId) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "supervisorId dan salesId wajib diisi" });
            return;
        }

        const removed = await clientsService.removeSupervisorSalesLink({
            clientId: req.params.id,
            supervisorId,
            salesId,
        });
        res.json({ success: removed });
    } catch (error) {
        next(error);
    }
});

export default router;
