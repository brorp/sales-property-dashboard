'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useTenant } from './TenantContext';
import { AUTH_INVALID_EVENT, AUTH_STORAGE_KEY, clearStoredAuthUser } from '../lib/api';

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
        id: 'seed-sales-ryan',
        name: 'Anto Widari',
        email: 'anto@widari.propertylounge.id',
        password: 'sales123',
        role: 'sales',
        clientSlug: 'widari',
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
        id: 'seed-sales-nicky',
        name: 'Sales Agung 1',
        email: 'sales1@agungsedayu.propertylounge.id',
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

const AuthContext = createContext(null);

function findLoginUserByEmail(email) {
    if (!email) {
        return null;
    }

    return LOGIN_USERS.find((item) => item.email === email) || null;
}

function normalizeStoredUser(parsedUser, matchedUser) {
    return {
        id: matchedUser.id,
        name: parsedUser?.name || matchedUser.name,
        email: matchedUser.email,
        role: matchedUser.role,
        clientSlug: matchedUser.clientSlug || null,
    };
}

export function AuthProvider({ children }) {
    const tenant = useTenant();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (tenant.loading) {
            return;
        }

        const saved = localStorage.getItem(AUTH_STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                const matchedUser = findLoginUserByEmail(parsed?.email);
                if (matchedUser && tenant.isUserAllowedOnCurrentSite(matchedUser)) {
                    setUser(normalizeStoredUser(parsed, matchedUser));
                } else {
                    clearStoredAuthUser();
                    setUser(null);
                }
            } catch {
                clearStoredAuthUser();
            }
        }
        setLoading(false);
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

    const login = (email, password) => {
        if (tenant.loading) {
            return { success: false, error: 'Tenant context belum siap' };
        }

        const found = LOGIN_USERS.find(u => u.email === email && u.password === password);
        if (!found) return { success: false, error: 'Email atau password salah' };

        if (!tenant.isUserAllowedOnCurrentSite(found)) {
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

        const userData = {
            id: found.id,
            name: found.name,
            email: found.email,
            role: found.role,
            clientSlug: found.clientSlug || null,
        };
        setUser(userData);
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userData));
        return { success: true };
    };

    const logout = () => {
        setUser(null);
        clearStoredAuthUser();
    };

    const updateCurrentUser = (patch) => {
        setUser((prev) => {
            if (!prev) {
                return prev;
            }
            const next = { ...prev, ...patch };
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    };

    const isAdmin = isManagerRole(user?.role);
    const availableLoginUsers = useMemo(
        () =>
            LOGIN_USERS.filter((item) => {
                return (
                    DEMO_LOGIN_USER_EMAILS.has(item.email) &&
                    tenant.isUserAllowedOnCurrentSite(item)
                );
            }),
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
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
};
