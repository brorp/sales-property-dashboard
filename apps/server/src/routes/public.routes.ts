import { Router } from "express";
import type { Response as ExpressResponse, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth/index";
import { repairKnownSeedCredential } from "../auth/credential-account";
import * as clientsService from "../services/clients.service";
import { logger } from "../utils/logger";

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

async function signInWithEmail(
    email: string,
    password: string,
    rememberMe: boolean,
    headers: Headers
) {
    return auth.api.signInEmail({
        asResponse: true,
        headers,
        body: {
            email,
            password,
            rememberMe,
        },
    });
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

        const normalizedEmail = String(email).trim().toLowerCase();
        const normalizedPassword = String(password);
        const forwardedHeaders = fromNodeHeaders(req.headers);
        let authResponse = await signInWithEmail(
            normalizedEmail,
            normalizedPassword,
            rememberMe !== false,
            forwardedHeaders
        );

        if (authResponse.status === 401) {
            const repairedSeedCredential = await repairKnownSeedCredential(
                normalizedEmail,
                normalizedPassword
            );

            if (repairedSeedCredential) {
                authResponse = await signInWithEmail(
                    normalizedEmail,
                    normalizedPassword,
                    rememberMe !== false,
                    forwardedHeaders
                );
            }

            if (authResponse.status === 401) {
                logger.warn("Public login unauthorized", {
                    email: normalizedEmail,
                    repairedSeedCredential,
                    origin: req.header("origin") || null,
                    host: req.header("host") || null,
                    userAgent: req.header("user-agent") || null,
                });
            }
        }

        await sendAuthResponse(authResponse, res);
    } catch (error) {
        next(error);
    }
});

export default router;
