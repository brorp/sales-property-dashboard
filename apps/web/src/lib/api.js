'use client';

const DEFAULT_API_BASE = 'http://localhost:3001';
export const AUTH_STORAGE_KEY = 'pl_user';
export const AUTH_SESSION_TOKEN_KEY = 'pl_session_token';
export const AUTH_INVALID_EVENT = 'property-lounge:auth-invalid';

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

export function getApiBaseUrl() {
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
            return normalizedBaseUrl.replace(/^http:\/\//i, 'https://');
        }

        return normalizedBaseUrl;
    }

    const protocol = String(process.env.NEXT_PUBLIC_API_PROTOCOL || 'http').trim();
    const derivedBaseUrl = deriveApiBaseFromRootDomain(protocol);
    if (derivedBaseUrl) {
        return derivedBaseUrl.replace(/\/$/, '');
    }

    const host = process.env.NEXT_PUBLIC_API_HOST;
    const port = process.env.NEXT_PUBLIC_API_PORT;
    const hostWithPort = joinHostAndPort(host, port);

    if (!hostWithPort) {
        return DEFAULT_API_BASE;
    }

    if (/^https?:\/\//i.test(hostWithPort)) {
        return hostWithPort.replace(/\/$/, '');
    }

    return `${protocol}://${hostWithPort}`.replace(/\/$/, '');
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

    const headers = buildApiRequestHeaders(options);

    const res = await fetch(`${getApiBaseUrl()}${path}`, {
        method,
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
