'use client';

const DEFAULT_API_BASE = 'http://localhost:3001';

export function getApiBaseUrl() {
    return (process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, '');
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
