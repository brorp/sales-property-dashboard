import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import * as clientsService from "../services/clients.service";
import * as salesService from "../services/sales.service";
import { auth } from "../auth/index";
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
        const { user: reqUser } = req as unknown as AuthenticatedRequest;

        // client_admin can only see their own client
        if (reqUser.role === "client_admin" && reqUser.clientId !== req.params.id) {
            res.status(403).json({ error: "FORBIDDEN", message: "Anda hanya bisa melihat user di client Anda sendiri" });
            return;
        }

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

        if (reqUser.role === "client_admin" && reqUser.clientId !== clientId) {
            res.status(403).json({ error: "FORBIDDEN", message: "Anda hanya bisa menambah user di client Anda sendiri" });
            return;
        }

        const { name, email, password, role, phone } = req.body ?? {};
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

// ─── Supervisor-Sales Mapping ────────────────────────────────────────────────

router.get("/:id/supervisor-sales", requireRole("root_admin", "client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user: reqUser } = req as unknown as AuthenticatedRequest;
        if (reqUser.role === "client_admin" && reqUser.clientId !== req.params.id) {
            res.status(403).json({ error: "FORBIDDEN", message: "Akses ditolak" });
            return;
        }

        const links = await clientsService.getSupervisorSalesMapping(req.params.id);
        res.json(links);
    } catch (error) {
        next(error);
    }
});

router.post("/:id/supervisor-sales", requireRole("root_admin", "client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user: reqUser } = req as unknown as AuthenticatedRequest;
        if (reqUser.role === "client_admin" && reqUser.clientId !== req.params.id) {
            res.status(403).json({ error: "FORBIDDEN", message: "Akses ditolak" });
            return;
        }

        const { supervisorId, salesId } = req.body ?? {};
        if (!supervisorId || !salesId) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "supervisorId dan salesId wajib diisi" });
            return;
        }

        const link = await clientsService.addSupervisorSalesLink(supervisorId, salesId);
        res.status(201).json(link);
    } catch (error) {
        next(error);
    }
});

router.delete("/:id/supervisor-sales", requireRole("root_admin", "client_admin") as any, async (req, res: Response, next: NextFunction) => {
    try {
        const { user: reqUser } = req as unknown as AuthenticatedRequest;
        if (reqUser.role === "client_admin" && reqUser.clientId !== req.params.id) {
            res.status(403).json({ error: "FORBIDDEN", message: "Akses ditolak" });
            return;
        }

        const { supervisorId, salesId } = req.body ?? {};
        if (!supervisorId || !salesId) {
            res.status(400).json({ error: "VALIDATION_ERROR", message: "supervisorId dan salesId wajib diisi" });
            return;
        }

        const removed = await clientsService.removeSupervisorSalesLink(supervisorId, salesId);
        res.json({ success: removed });
    } catch (error) {
        next(error);
    }
});

export default router;
