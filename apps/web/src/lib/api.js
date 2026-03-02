'use client';

const DEFAULT_API_BASE = 'http://localhost:3001';

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

export function getApiBaseUrl() {
    const explicitBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (explicitBaseUrl && String(explicitBaseUrl).trim()) {
        return String(explicitBaseUrl).replace(/\/$/, '');
    }

    const protocol = String(process.env.NEXT_PUBLIC_API_PROTOCOL || 'http').trim();
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

export async function apiRequest(path, options = {}) {
    const {
        method = 'GET',
        body,
        user,
        extraHeaders = {},
    } = options;

    const headers = {
        'Content-Type': 'application/json',
        ...extraHeaders,
    };

    if (user?.email) {
        headers['x-dev-user-email'] = user.email;
    }

    const res = await fetch(`${getApiBaseUrl()}${path}`, {
        method,
        headers,
        credentials: 'include',
        ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
    }

    if (res.status === 204) {
        return null;
    }

    return res.json();
}
