import { Router } from "express";
import type { Response, NextFunction } from "express";
import * as clientsService from "../services/clients.service";

const router: ReturnType<typeof Router> = Router();

router.get("/app-context", async (req, res: Response, next: NextFunction) => {
    try {
        const forwardedHost = req.header("x-forwarded-host");
        const hostHeader = req.header("host");
        const host =
            typeof req.query.host === "string" && req.query.host.trim()
                ? req.query.host
                : forwardedHost || hostHeader || null;
        const slug =
            typeof req.query.slug === "string" && req.query.slug.trim()
                ? req.query.slug
                : null;

        const context = await clientsService.resolvePublicAppContext({
            host,
            slug,
        });

        res.json(context);
    } catch (error) {
        next(error);
    }
});

export default router;
