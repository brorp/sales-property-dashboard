'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useTenant } from './TenantContext';
import {
    AUTH_INVALID_EVENT,
    AUTH_STORAGE_KEY,
    clearStoredAuthUser,
    getApiBaseUrl,
    getStoredAuthSessionToken,
    persistAuthSessionToken,
} from '../lib/api';

const MANAGER_ROLES = new Set(['admin', 'root_admin', 'client_admin', 'supervisor']);

const LOGIN_USERS = [
    {
        id: 'seed-client-admin-wr',
        name: 'Widari Residence Admin',
        email: 'admin@widariresidence.co.id',
        password: 'admin123',
        role: 'client_admin',
        clientSlug: 'widari-residence',
    },
    {
        id: 'seed-supervisor-aldi-wr',
        name: 'Spv Aldi',
        email: 'aliashadi@widariresidence.co.id',
        password: 'supervisor123',
        role: 'supervisor',
        clientSlug: 'widari-residence',
    },
    {
        id: 'seed-sales-mila-wr',
        name: 'Mila',
        email: 'mila@widariresidence.co.id',
        password: 'sales123',
        role: 'sales',
        clientSlug: 'widari-residence',
    },
    {
        id: 'seed-client-admin-wv',
        name: 'WV Admin',
        email: 'admin-wv@widari.propertylounge.id',
        password: 'admin123',
        role: 'client_admin',
        clientSlug: 'widari-village',
    },
];

const DEMO_LOGIN_USER_EMAILS = new Set([
    'admin@widariresidence.co.id',
    'aliashadi@widariresidence.co.id',
    'mila@widariresidence.co.id',
    'admin-wv@widari.propertylounge.id',
]);

const AuthContext = createContext(null);

function isManagerRole(role) {
    return MANAGER_ROLES.has(role || '');
}

function getRoleLabel(role) {
    switch (role) {
        case 'root_admin':
            return 'Root Admin';
        case 'client_admin':
        case 'admin':
            return 'Client Admin';
        case 'supervisor':
            return 'Supervisor';
        default:
            return 'Sales';
    }
}

function isDemoLoginUser(userLike) {
    return Boolean(userLike?.email && DEMO_LOGIN_USER_EMAILS.has(userLike.email));
}

function findLoginUserByEmail(email) {
    if (!email) {
        return null;
    }

    return LOGIN_USERS.find((item) => item.email === email) || null;
}

function findLoginUserByCredentials(email, password) {
    return LOGIN_USERS.find((item) => item.email === email && item.password === password) || null;
}

function normalizeSessionUser(profile) {
    if (!profile?.id || !profile?.email) {
        return null;
    }

    return {
        id: profile.id,
        name: profile.name || profile.email,
        email: profile.email,
        phone: profile.phone || null,
        role: profile.role || 'sales',
        clientId: profile.clientId || null,
        clientSlug: profile.clientSlug || null,
        supervisorId: profile.supervisorId || null,
        image: profile.image || null,
        isSuspended: Boolean(profile.isSuspended),
        suspension: profile.suspension || null,
    };
}

function normalizeStoredUser(parsedUser, matchedUser) {
    return {
        id: matchedUser.id,
        name: parsedUser?.name || matchedUser.name,
        email: matchedUser.email,
        phone: parsedUser?.phone || null,
        role: matchedUser.role,
        clientId: matchedUser.clientId || null,
        clientSlug: matchedUser.clientSlug || null,
        supervisorId: matchedUser.supervisorId || null,
        image: parsedUser?.image || null,
        isSuspended: false,
        suspension: null,
    };
}

function canUseLocalAuthFallback() {
    if (typeof window === 'undefined') {
        return false;
    }

    const envOverride = String(process.env.NEXT_PUBLIC_ENABLE_LOCAL_LOGIN_FALLBACK || '').trim().toLowerCase();
    if (envOverride === 'true') {
        return true;
    }
    if (envOverride === 'false') {
        return false;
    }

    const hostname = String(window.location.hostname || '').trim().toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

async function readErrorMessage(response) {
    const text = await response.text();
    if (!text) {
        return `HTTP ${response.status}`;
    }

    try {
        const parsed = JSON.parse(text);
        if (typeof parsed?.error === 'string' && parsed.error.trim()) {
            return parsed.error;
        }
        if (typeof parsed?.message === 'string' && parsed.message.trim()) {
            return parsed.message;
        }
    } catch {
        // Ignore JSON parsing errors and fall back to raw text.
    }

    return text;
}

async function fetchCurrentProfile() {
    const headers = {};
    const sessionToken = getStoredAuthSessionToken();

    if (sessionToken) {
        headers.Authorization = `Bearer ${sessionToken}`;
    }

    const response = await fetch(`${getApiBaseUrl()}/api/profile/me`, {
        credentials: 'include',
        headers,
    });

    if (response.status === 401) {
        return null;
    }

    if (!response.ok) {
        throw new Error(await readErrorMessage(response));
    }

    return normalizeSessionUser(await response.json());
}

function persistUser(userLike) {
    if (typeof window === 'undefined') {
        return;
    }

    if (!userLike) {
        clearStoredAuthUser();
        return;
    }

    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userLike));
}

function restoreStoredFallbackUser(tenant, setUser) {
    if (typeof window === 'undefined' || !canUseLocalAuthFallback()) {
        setUser(null);
        clearStoredAuthUser();
        return;
    }

    const saved = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!saved) {
        setUser(null);
        clearStoredAuthUser();
        return;
    }

    try {
        const parsed = JSON.parse(saved);
        const matchedUser = findLoginUserByEmail(parsed?.email);
        if (matchedUser && tenant.isUserAllowedOnCurrentSite(matchedUser)) {
            const restoredUser = normalizeStoredUser(parsed, matchedUser);
            setUser(restoredUser);
            persistUser(restoredUser);
            return;
        }
    } catch {
        // Ignore malformed local fallback state and clear it below.
    }

    setUser(null);
    clearStoredAuthUser();
}

export function AuthProvider({ children }) {
    const tenant = useTenant();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (tenant.loading) {
            return;
        }

        let cancelled = false;

        async function loadUserFromSession() {
            setLoading(true);

            try {
                const currentUser = await fetchCurrentProfile();
                if (cancelled) {
                    return;
                }

                if (currentUser && tenant.isUserAllowedOnCurrentSite(currentUser)) {
                    setUser(currentUser);
                    persistUser(currentUser);
                } else {
                    restoreStoredFallbackUser(tenant, setUser);
                }
            } catch {
                if (!cancelled) {
                    restoreStoredFallbackUser(tenant, setUser);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        void loadUserFromSession();

        return () => {
            cancelled = true;
        };
    }, [tenant]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        const handleInvalidAuth = () => {
            clearStoredAuthUser();
            setUser(null);
        };

        window.addEventListener(AUTH_INVALID_EVENT, handleInvalidAuth);
        return () => {
            window.removeEventListener(AUTH_INVALID_EVENT, handleInvalidAuth);
        };
    }, []);

    const login = async (email, password) => {
        if (tenant.loading) {
            return { success: false, error: 'Tenant context belum siap' };
        }

        let requestFailed = false;

        try {
            const response = await fetch(`${getApiBaseUrl()}/api/public/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    email,
                    password,
                    rememberMe: true,
                }),
            });

            if (response.ok) {
                const loginResult = await response.json().catch(() => null);
                persistAuthSessionToken(loginResult?.token || null);
                const currentUser = await fetchCurrentProfile();
                if (!currentUser) {
                    persistAuthSessionToken(null);
                    return {
                        success: false,
                        error: 'Session login tidak terbentuk.',
                    };
                }

                if (!tenant.isUserAllowedOnCurrentSite(currentUser)) {
                    await fetch(`${getApiBaseUrl()}/api/auth/sign-out`, {
                        method: 'POST',
                        credentials: 'include',
                    }).catch(() => {});

                    clearStoredAuthUser();
                    persistAuthSessionToken(null);
                    setUser(null);

                    if (tenant.isClientSite && tenant.tenant?.name) {
                        return {
                            success: false,
                            error: `Akun ini tidak bisa login di domain ${tenant.tenant.name}.`,
                        };
                    }

                    return {
                        success: false,
                        error: 'Akun ini tidak diizinkan untuk site ini.',
                    };
                }

                setUser(currentUser);
                persistUser(currentUser);
                return { success: true, user: currentUser };
            }

            persistAuthSessionToken(null);
            return {
                success: false,
                error: await readErrorMessage(response),
            };
        } catch {
            requestFailed = true;
        }

        if (!requestFailed) {
            return {
                success: false,
                error: 'Email atau password salah',
            };
        }

        if (!canUseLocalAuthFallback()) {
            return {
                success: false,
                error: 'Tidak bisa menghubungi server login.',
            };
        }

        const fallbackUser = findLoginUserByCredentials(email, password);
        if (!fallbackUser) {
            return {
                success: false,
                error: 'Email atau password salah',
            };
        }

        if (!tenant.isUserAllowedOnCurrentSite(fallbackUser)) {
            if (tenant.isClientSite && tenant.tenant?.name) {
                return {
                    success: false,
                    error: `Akun ini tidak bisa login di domain ${tenant.tenant.name}.`,
                };
            }

            return {
                success: false,
                error: 'Akun ini tidak diizinkan untuk site ini.',
            };
        }

        const restoredUser = normalizeStoredUser(fallbackUser, fallbackUser);
        persistAuthSessionToken(null);
        setUser(restoredUser);
        persistUser(restoredUser);
        return { success: true, user: restoredUser };
    };

    const logout = () => {
        setUser(null);
        clearStoredAuthUser();
        persistAuthSessionToken(null);

        void fetch(`${getApiBaseUrl()}/api/auth/sign-out`, {
            method: 'POST',
            credentials: 'include',
        }).catch(() => {});
    };

    const updateCurrentUser = (patch) => {
        setUser((prev) => {
            if (!prev) {
                return prev;
            }
            const next = { ...prev, ...patch };
            persistUser(next);
            return next;
        });
    };

    const isAdmin = isManagerRole(user?.role);
    const availableLoginUsers = useMemo(
        () =>
            LOGIN_USERS.filter((item) => (
                isDemoLoginUser(item) && tenant.isUserAllowedOnCurrentSite(item)
            )),
        [tenant]
    );

    return (
        <AuthContext.Provider value={{ user, login, logout, loading, isAdmin, updateCurrentUser, getRoleLabel, availableLoginUsers }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return ctx;
};
