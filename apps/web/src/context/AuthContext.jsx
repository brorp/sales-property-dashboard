'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useTenant } from './TenantContext';
import {
    AUTH_INVALID_EVENT,
    AUTH_STORAGE_KEY,
    clearStoredAuthUser,
    getApiBaseUrl,
} from '../lib/api';

const MANAGER_ROLES = new Set(['admin', 'root_admin', 'client_admin', 'supervisor']);

const LOGIN_USERS = [
    {
        id: 'seed-root-admin',
        name: 'Root Admin',
        email: 'root@propertylounge.id',
        password: 'admin123',
        role: 'root_admin',
        clientSlug: null,
    },
    {
        id: 'seed-client-admin',
        name: 'Widari Admin',
        email: 'admin@widari.propertylounge.id',
        password: 'admin123',
        role: 'client_admin',
        clientSlug: 'widari',
    },
    {
        id: 'seed-supervisor',
        name: 'Supervisor Widari A',
        email: 'supervisor.a@widari.propertylounge.id',
        password: 'admin123',
        role: 'supervisor',
        clientSlug: 'widari',
    },
    {
        id: 'seed-supervisor-widari-b',
        name: 'Supervisor Widari B',
        email: 'supervisor.b@widari.propertylounge.id',
        password: 'admin123',
        role: 'supervisor',
        clientSlug: 'widari',
    },
    {
        id: 'seed-sales-ryan',
        name: 'Anto Widari',
        email: 'anto@widari.propertylounge.id',
        password: 'sales123',
        role: 'sales',
        clientSlug: 'widari',
    },
    {
        id: 'seed-sales-andi',
        name: 'Andi Widari',
        email: 'andi@widari.propertylounge.id',
        password: 'sales123',
        role: 'sales',
        clientSlug: 'widari',
    },
    {
        id: 'seed-sales-rudi',
        name: 'Rudi Widari',
        email: 'rudi@widari.propertylounge.id',
        password: 'sales123',
        role: 'sales',
        clientSlug: 'widari',
    },
    {
        id: 'seed-sales-beni',
        name: 'Beni Widari',
        email: 'beni@widari.propertylounge.id',
        password: 'sales123',
        role: 'sales',
        clientSlug: 'widari',
    },
    {
        id: 'seed-sales-dika',
        name: 'Dika Widari',
        email: 'dika@widari.propertylounge.id',
        password: 'sales123',
        role: 'sales',
        clientSlug: 'widari',
    },
    {
        id: 'seed-client-admin-aryana',
        name: 'Aryana Admin',
        email: 'admin@aryana.propertylounge.id',
        password: 'admin123',
        role: 'client_admin',
        clientSlug: 'aryana',
    },
    {
        id: 'seed-supervisor-aryana-c',
        name: 'Supervisor Aryana C',
        email: 'supervisor.c@aryana.propertylounge.id',
        password: 'admin123',
        role: 'supervisor',
        clientSlug: 'aryana',
    },
    {
        id: 'seed-supervisor-aryana-d',
        name: 'Supervisor Aryana D',
        email: 'supervisor.d@aryana.propertylounge.id',
        password: 'admin123',
        role: 'supervisor',
        clientSlug: 'aryana',
    },
    {
        id: 'seed-sales-rachmat',
        name: 'Sales Aryana 1',
        email: 'sales1@aryana.propertylounge.id',
        password: 'sales123',
        role: 'sales',
        clientSlug: 'aryana',
    },
    {
        id: 'seed-sales-aryana-2',
        name: 'Sales Aryana 2',
        email: 'sales2@aryana.propertylounge.id',
        password: 'sales123',
        role: 'sales',
        clientSlug: 'aryana',
    },
    {
        id: 'seed-client-admin-agung',
        name: 'Agung Sedayu Admin',
        email: 'admin@agungsedayu.propertylounge.id',
        password: 'admin123',
        role: 'client_admin',
        clientSlug: 'agung-sedayu',
    },
    {
        id: 'seed-supervisor-agung-e',
        name: 'Supervisor Agung E',
        email: 'supervisor.e@agungsedayu.propertylounge.id',
        password: 'admin123',
        role: 'supervisor',
        clientSlug: 'agung-sedayu',
    },
    {
        id: 'seed-supervisor-agung-f',
        name: 'Supervisor Agung F',
        email: 'supervisor.f@agungsedayu.propertylounge.id',
        password: 'admin123',
        role: 'supervisor',
        clientSlug: 'agung-sedayu',
    },
    {
        id: 'seed-sales-nicky',
        name: 'Sales Agung 1',
        email: 'sales1@agungsedayu.propertylounge.id',
        password: 'sales123',
        role: 'sales',
        clientSlug: 'agung-sedayu',
    },
    {
        id: 'seed-sales-agung-2',
        name: 'Sales Agung 2',
        email: 'sales2@agungsedayu.propertylounge.id',
        password: 'sales123',
        role: 'sales',
        clientSlug: 'agung-sedayu',
    },
];

const DEMO_LOGIN_USER_EMAILS = new Set([
    'admin@widari.propertylounge.id',
    'supervisor.a@widari.propertylounge.id',
    'anto@widari.propertylounge.id',
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
        role: profile.role || 'sales',
        clientId: profile.clientId || null,
        clientSlug: profile.clientSlug || null,
        supervisorId: profile.supervisorId || null,
        image: profile.image || null,
    };
}

function normalizeStoredUser(parsedUser, matchedUser) {
    return {
        id: matchedUser.id,
        name: parsedUser?.name || matchedUser.name,
        email: matchedUser.email,
        role: matchedUser.role,
        clientId: matchedUser.clientId || null,
        clientSlug: matchedUser.clientSlug || null,
        supervisorId: matchedUser.supervisorId || null,
        image: parsedUser?.image || null,
    };
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
    const response = await fetch(`${getApiBaseUrl()}/api/profile/me`, {
        credentials: 'include',
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
                    const saved = window.localStorage.getItem(AUTH_STORAGE_KEY);
                    if (saved) {
                        try {
                            const parsed = JSON.parse(saved);
                            const matchedUser = findLoginUserByEmail(parsed?.email);
                            if (matchedUser && tenant.isUserAllowedOnCurrentSite(matchedUser)) {
                                const restoredUser = normalizeStoredUser(parsed, matchedUser);
                                setUser(restoredUser);
                                persistUser(restoredUser);
                            } else {
                                setUser(null);
                                clearStoredAuthUser();
                            }
                        } catch {
                            setUser(null);
                            clearStoredAuthUser();
                        }
                    } else {
                        setUser(null);
                        clearStoredAuthUser();
                    }
                }
            } catch {
                if (!cancelled) {
                    const saved = window.localStorage.getItem(AUTH_STORAGE_KEY);
                    if (saved) {
                        try {
                            const parsed = JSON.parse(saved);
                            const matchedUser = findLoginUserByEmail(parsed?.email);
                            if (matchedUser && tenant.isUserAllowedOnCurrentSite(matchedUser)) {
                                const restoredUser = normalizeStoredUser(parsed, matchedUser);
                                setUser(restoredUser);
                                persistUser(restoredUser);
                            } else {
                                setUser(null);
                                clearStoredAuthUser();
                            }
                        } catch {
                            setUser(null);
                            clearStoredAuthUser();
                        }
                    } else {
                        setUser(null);
                        clearStoredAuthUser();
                    }
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

        try {
            const response = await fetch(`${getApiBaseUrl()}/api/auth/sign-in/email`, {
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
                const currentUser = await fetchCurrentProfile();
                if (!currentUser) {
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
                return { success: true };
            }
        } catch {
            // Fall back to legacy seeded login if auth backend request fails.
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
        setUser(restoredUser);
        persistUser(restoredUser);
        return { success: true };
    };

    const logout = () => {
        setUser(null);
        clearStoredAuthUser();

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
