'use client';

const DEFAULT_API_BASE = 'http://localhost:3001';
export const AUTH_STORAGE_KEY = 'pl_user';
export const AUTH_SESSION_TOKEN_KEY = 'pl_session_token';
export const AUTH_INVALID_EVENT = 'property-lounge:auth-invalid';
const MUTATION_IDEMPOTENCY_TTL_MS = 20_000;
const mutationRequestCache = new Map();

function joinHostAndPort(host, port) {
    if (!host) {
        return '';
    }

    const trimmedHost = String(host).trim();
    if (!trimmedHost) {
        return '';
    }

    const hasProtocol = /^https?:\/\//i.test(trimmedHost);
    if (hasProtocol) {
        return trimmedHost;
    }

    if (!port) {
        return trimmedHost;
    }

    // If host already includes a port, keep it.
    if (trimmedHost.includes(':')) {
        return trimmedHost;
    }

    return `${trimmedHost}:${port}`;
}

function getBrowserHostname() {
    if (typeof window === 'undefined') {
        return '';
    }

    return String(window.location.hostname || '').trim().toLowerCase();
}

function isLocalBrowserHost(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function shouldUseDevAuthHeaders() {
    if (typeof window === 'undefined') {
        return false;
    }

    const envOverride = String(process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH_HEADERS || '').trim().toLowerCase();
    if (envOverride === 'true') {
        return true;
    }
    if (envOverride === 'false') {
        return false;
    }

    return isLocalBrowserHost(getBrowserHostname());
}

function deriveApiBaseFromRootDomain(protocol) {
    const rootDomain = String(process.env.NEXT_PUBLIC_APP_ROOT_DOMAIN || '').trim().toLowerCase();
    if (!rootDomain) {
        return '';
    }

    const hostname = getBrowserHostname();
    if (!hostname) {
        return '';
    }

    if (hostname !== rootDomain && !hostname.endsWith(`.${rootDomain}`)) {
        return '';
    }

    const safeProtocol =
        protocol ||
        (typeof window !== 'undefined' ? window.location.protocol.replace(':', '') : 'https');

    return `${safeProtocol}://api.${rootDomain}`;
}

function getErrorMessage(text, status) {
    if (!text) {
        return `HTTP ${status}`;
    }

    try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') {
            if (typeof parsed.error === 'string' && parsed.error.trim()) {
                return parsed.error;
            }

            if (typeof parsed.message === 'string' && parsed.message.trim()) {
                return parsed.message;
            }
        }
    } catch {
        // Ignore JSON parsing errors and fall back to raw text.
    }

    return text;
}

function isMutationMethod(method) {
    const normalized = String(method || 'GET').toUpperCase();
    return normalized === 'POST' || normalized === 'PATCH' || normalized === 'PUT' || normalized === 'DELETE';
}

function stableSerialize(value) {
    if (value === null) {
        return 'null';
    }

    if (value === undefined) {
        return 'undefined';
    }

    if (typeof value === 'string') {
        return JSON.stringify(value);
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    if (Array.isArray(value)) {
        return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
    }

    if (typeof value === 'object') {
        const entries = Object.entries(value)
            .filter(([, nestedValue]) => nestedValue !== undefined)
            .sort(([a], [b]) => a.localeCompare(b));
        return `{${entries
            .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableSerialize(nestedValue)}`)
            .join(',')}}`;
    }

    return JSON.stringify(String(value));
}

function generateIdempotencyKey() {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildMutationSignature(path, method, body) {
    return `${String(method || 'GET').toUpperCase()}:${path}:${stableSerialize(body ?? null)}`;
}

function cleanupMutationCache(now) {
    for (const [signature, entry] of mutationRequestCache.entries()) {
        if (!entry) {
            mutationRequestCache.delete(signature);
            continue;
        }

        if (!entry.promise && Number(entry.expiresAt || 0) <= now) {
            mutationRequestCache.delete(signature);
        }
    }
}

export function clearStoredAuthUser() {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        window.localStorage.removeItem(AUTH_SESSION_TOKEN_KEY);
    } catch {
        // Ignore storage errors in private browsing / restricted contexts.
    }
}

export function getStoredAuthSessionToken() {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const token = window.localStorage.getItem(AUTH_SESSION_TOKEN_KEY);
        return token && token.trim() ? token.trim() : null;
    } catch {
        return null;
    }
}

export function persistAuthSessionToken(token) {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        if (!token || !String(token).trim()) {
            window.localStorage.removeItem(AUTH_SESSION_TOKEN_KEY);
            return;
        }

        window.localStorage.setItem(AUTH_SESSION_TOKEN_KEY, String(token).trim());
    } catch {
        // Ignore storage errors in private browsing / restricted contexts.
    }
}

function notifyUnauthorized() {
    if (typeof window === 'undefined') {
        return;
    }

    clearStoredAuthUser();
    window.dispatchEvent(new CustomEvent(AUTH_INVALID_EVENT));
}

export const WORKSPACE_STORAGE_KEY = 'pl_workspace';

export function getApiBaseUrl() {
    let baseUrl = '';

    const explicitBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (explicitBaseUrl && String(explicitBaseUrl).trim()) {
        const normalizedBaseUrl = String(explicitBaseUrl).replace(/\/$/, '');

        if (
            typeof window !== 'undefined' &&
            window.location.protocol === 'https:' &&
            normalizedBaseUrl.startsWith('http://') &&
            !normalizedBaseUrl.startsWith('http://localhost') &&
            !normalizedBaseUrl.startsWith('http://127.0.0.1')
        ) {
            baseUrl = normalizedBaseUrl.replace(/^http:\/\//i, 'https://');
        } else {
            baseUrl = normalizedBaseUrl;
        }
    } else if (typeof window !== 'undefined' && 
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        // Use local Next.js proxy during development (see rewrites in next.config.mjs)
        baseUrl = '';
    } else {
        const protocol = String(process.env.NEXT_PUBLIC_API_PROTOCOL || 'http').trim();
        const derivedBaseUrl = deriveApiBaseFromRootDomain(protocol);
        if (derivedBaseUrl) {
            baseUrl = derivedBaseUrl.replace(/\/$/, '');
        } else {
            const host = process.env.NEXT_PUBLIC_API_HOST;
            const port = process.env.NEXT_PUBLIC_API_PORT;
            const hostWithPort = joinHostAndPort(host, port);

            if (!hostWithPort) {
                baseUrl = DEFAULT_API_BASE;
            } else if (/^https?:\/\//i.test(hostWithPort)) {
                baseUrl = hostWithPort.replace(/\/$/, '');
            } else {
                baseUrl = `${protocol}://${hostWithPort}`.replace(/\/$/, '');
            }
        }
    }

    // Append apiPrefix if active workspace is selected
    if (typeof window !== 'undefined') {
        try {
            const saved = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed.apiPrefix === 'string') {
                    // Ensure prefix starts with / or is empty, and doesn't end with /
                    const prefix = parsed.apiPrefix.trim().replace(/\/+$/, '');
                    if (prefix && prefix !== '/') {
                        baseUrl += prefix.startsWith('/') ? prefix : `/${prefix}`;
                    }
                }
            }
        } catch (err) {
            // ignore
        }
    }

    return baseUrl;
}

export function buildApiRequestHeaders(options = {}) {
    const {
        user,
        extraHeaders = {},
        includeJsonContentType = true,
    } = options;

    const headers = { ...extraHeaders };
    const sessionToken = getStoredAuthSessionToken();

    if (includeJsonContentType && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    if (user?.email && shouldUseDevAuthHeaders()) {
        headers['x-dev-user-email'] = user.email;
    }

    if (sessionToken && !headers.Authorization) {
        headers.Authorization = `Bearer ${sessionToken}`;
    }

    return headers;
}

export async function apiRequest(path, options = {}) {
    const {
        method = 'GET',
        body,
    } = options;
    const upperMethod = String(method || 'GET').toUpperCase();
    const isMutation = isMutationMethod(upperMethod);
    const now = Date.now();
    let mutationSignature = '';
    let cacheEntry = null;

    if (isMutation) {
        cleanupMutationCache(now);
        mutationSignature = buildMutationSignature(path, upperMethod, body);
        cacheEntry = mutationRequestCache.get(mutationSignature) || null;
        if (cacheEntry?.promise) {
            return cacheEntry.promise;
        }
    }

    const nextHeaders = { ...(options.extraHeaders || {}) };
    if (isMutation) {
        const activeKey =
            cacheEntry?.idempotencyKey && Number(cacheEntry.expiresAt || 0) > now
                ? cacheEntry.idempotencyKey
                : generateIdempotencyKey();
        nextHeaders['X-Idempotency-Key'] = activeKey;
        cacheEntry = {
            idempotencyKey: activeKey,
            expiresAt: now + MUTATION_IDEMPOTENCY_TTL_MS,
            promise: null,
        };
        mutationRequestCache.set(mutationSignature, cacheEntry);
    }

    const headers = buildApiRequestHeaders({
        ...options,
        extraHeaders: nextHeaders,
    });

    const requestPromise = (async () => {
        const res = await fetch(`${getApiBaseUrl()}${path}`, {
            method: upperMethod,
            headers,
            credentials: 'include',
            ...(body ? { body: JSON.stringify(body) } : {}),
        });

        if (!res.ok) {
            const text = await res.text();
            if (res.status === 401) {
                notifyUnauthorized();
            }
            throw new Error(getErrorMessage(text, res.status));
        }

        if (res.status === 204) {
            return null;
        }

        return res.json();
    })();

    if (isMutation && mutationSignature) {
        cacheEntry.promise = requestPromise;
    }

    try {
        return await requestPromise;
    } finally {
        if (isMutation && mutationSignature) {
            const latestEntry = mutationRequestCache.get(mutationSignature);
            if (latestEntry) {
                latestEntry.promise = null;
                latestEntry.expiresAt = Date.now() + MUTATION_IDEMPOTENCY_TTL_MS;
            }
        }
    }
}

export async function publicApiRequest(path, options = {}) {
    const {
        method = 'GET',
        body,
        extraHeaders = {},
    } = options;

    const headers = {
        'Content-Type': 'application/json',
        ...extraHeaders,
    };

    const res = await fetch(`${getApiBaseUrl()}${path}`, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(getErrorMessage(text, res.status));
    }

    if (res.status === 204) {
        return null;
    }

    return res.json();
}
