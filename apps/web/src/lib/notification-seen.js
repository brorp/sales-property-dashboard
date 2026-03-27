'use client';

const LEADS_SEEN_KEY = 'pl_seen_leads_at';
const LOGS_SEEN_KEY = 'pl_seen_logs_at';

function getStorageValue(key) {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const value = window.localStorage.getItem(key);
        return value && value.trim() ? value.trim() : null;
    } catch {
        return null;
    }
}

function setStorageValue(key, value) {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        if (!value) {
            window.localStorage.removeItem(key);
            return;
        }

        window.localStorage.setItem(key, String(value));
    } catch {
        // Ignore storage errors on restricted browsers.
    }
}

export function getSeenLeadsAt() {
    return getStorageValue(LEADS_SEEN_KEY);
}

export function getSeenLogsAt() {
    return getStorageValue(LOGS_SEEN_KEY);
}

export function markLeadsSeenAt(value) {
    setStorageValue(LEADS_SEEN_KEY, value || new Date().toISOString());
}

export function markLogsSeenAt(value) {
    setStorageValue(LOGS_SEEN_KEY, value || new Date().toISOString());
}

export function hasUnreadSince(latestAt, seenAt) {
    if (!latestAt) {
        return false;
    }

    const latestTime = new Date(latestAt).getTime();
    if (Number.isNaN(latestTime)) {
        return false;
    }

    if (!seenAt) {
        return true;
    }

    const seenTime = new Date(seenAt).getTime();
    if (Number.isNaN(seenTime)) {
        return true;
    }

    return latestTime > seenTime;
}
