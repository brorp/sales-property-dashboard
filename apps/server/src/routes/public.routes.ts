import { Router } from "express";
import type { Response as ExpressResponse, NextFunction } from "express";
import { auth } from "../auth/index";
import * as clientsService from "../services/clients.service";

const router: ReturnType<typeof Router> = Router();

function getSetCookieHeaders(headers: Headers): string[] {
    const cookieAwareHeaders = headers as Headers & {
        getSetCookie?: () => string[];
    };

    if (typeof cookieAwareHeaders.getSetCookie === "function") {
        return cookieAwareHeaders.getSetCookie().filter(Boolean);
    }

    const raw = headers.get("set-cookie");
    return raw ? [raw] : [];
}

async function sendAuthResponse(source: globalThis.Response, res: ExpressResponse) {
    source.headers.forEach((value, key) => {
        if (key.toLowerCase() === "set-cookie") {
            return;
        }
        res.setHeader(key, value);
    });

    const setCookies = getSetCookieHeaders(source.headers);
    if (setCookies.length > 0) {
        res.setHeader("set-cookie", setCookies);
    }

    const body = await source.text();
    res.status(source.status);

    if (!body) {
        res.end();
        return;
    }

    const contentType = source.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        res.type("application/json").send(body);
        return;
    }

    res.send(body);
}

router.get("/app-context", async (req, res: ExpressResponse, next: NextFunction) => {
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

router.post("/login", async (req, res: ExpressResponse, next: NextFunction) => {
    try {
        const { email, password, rememberMe } = req.body ?? {};

        if (!email || !password) {
            res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "email dan password wajib diisi",
            });
            return;
        }

        const authResponse = await auth.api.signInEmail({
            asResponse: true,
            headers: new Headers(),
            body: {
                email: String(email).trim().toLowerCase(),
                password: String(password),
                rememberMe: rememberMe !== false,
            },
        });

        await sendAuthResponse(authResponse, res);
    } catch (error) {
        next(error);
    }
});

export default router;
