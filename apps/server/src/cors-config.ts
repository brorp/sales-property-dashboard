type CorsOriginCallback = (error: Error | null, allow?: boolean) => void;

const DEFAULT_DEV_ORIGINS = ["http://localhost:5173", "http://localhost:3000"];

function normalizeOrigin(origin: string): string {
    return origin.trim().replace(/\/+$/, "");
}

function parseCsvOrigins(raw: string | undefined): string[] {
    if (!raw) {
        return [];
    }

    return raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map(normalizeOrigin);
}

function parseCsvDomains(raw: string | undefined): string[] {
    if (!raw) {
        return [];
    }

    return raw
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .map((item) => item.replace(/^\*\./, ""))
        .map((item) => item.replace(/\.+$/, ""));
}

function isVercelPreviewOrigin(origin: string): boolean {
    try {
        const url = new URL(origin);
        return url.protocol === "https:" && url.hostname.endsWith(".vercel.app");
    } catch {
        return false;
    }
}

function matchesWildcardRootDomain(origin: string, rootDomains: string[]): boolean {
    try {
        const url = new URL(origin);
        const hostname = url.hostname.toLowerCase();

        return rootDomains.some((domain) => {
            return hostname === domain || hostname.endsWith(`.${domain}`);
        });
    } catch {
        return false;
    }
}

const allowVercelPreview =
    String(process.env.CORS_ALLOW_VERCEL_PREVIEW || "false").toLowerCase() === "true";
const wildcardRootDomains = parseCsvDomains(
    process.env.CORS_ROOT_DOMAINS || process.env.APP_ROOT_DOMAINS
);

const configuredOrigins = Array.from(
    new Set([
        ...parseCsvOrigins(process.env.CORS_ORIGINS),
        ...parseCsvOrigins(process.env.CORS_ORIGIN),
        ...DEFAULT_DEV_ORIGINS,
    ])
);

export function getConfiguredCorsOrigins(): string[] {
    return configuredOrigins;
}

export function getCorsAllowVercelPreview(): boolean {
    return allowVercelPreview;
}

export function getCorsWildcardRootDomains(): string[] {
    return wildcardRootDomains;
}

export function isAllowedOrigin(origin: string | undefined): boolean {
    // Some server-to-server calls don't send Origin header.
    if (!origin) {
        return true;
    }

    const normalized = normalizeOrigin(origin);

    if (configuredOrigins.includes(normalized)) {
        return true;
    }

    if (allowVercelPreview && isVercelPreviewOrigin(normalized)) {
        return true;
    }

    if (
        wildcardRootDomains.length > 0 &&
        matchesWildcardRootDomain(normalized, wildcardRootDomains)
    ) {
        return true;
    }

    return false;
}

export function corsOriginDelegate(
    origin: string | undefined,
    callback: CorsOriginCallback
): void {
    if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
    }

    callback(new Error(`Not allowed by CORS: ${origin || "unknown origin"}`));
}
