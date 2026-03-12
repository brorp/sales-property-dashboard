'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';

function hasAllowedRole(user, roles) {
    return Boolean(user?.role && roles.includes(user.role));
}

export function ProtectedRoute({ children }) {
    const router = useRouter();
    const { user, loading } = useAuth();

    useEffect(() => {
        if (!loading && !user) {
            router.replace('/login');
        }
    }, [loading, user, router]);

    if (loading || !user) {
        return null;
    }

    return children;
}

export function AdminRoute({ children }) {
    const router = useRouter();
    const { user, loading, isAdmin } = useAuth();

    useEffect(() => {
        if (loading) return;
        if (!user) {
            router.replace('/login');
            return;
        }
        if (!isAdmin) {
            router.replace('/');
        }
    }, [loading, user, isAdmin, router]);

    if (loading || !user || !isAdmin) {
        return null;
    }

    return children;
}

export function RoleRoute({ children, allowedRoles = [] }) {
    const router = useRouter();
    const { user, loading } = useAuth();
    const allowed = hasAllowedRole(user, allowedRoles);

    useEffect(() => {
        if (loading) return;
        if (!user) {
            router.replace('/login');
            return;
        }
        if (!allowed) {
            router.replace('/');
        }
    }, [allowed, loading, router, user]);

    if (loading || !user || !allowed) {
        return null;
    }

    return children;
}

export function SharedWhatsAppRoute({ children }) {
    const router = useRouter();
    const { user, loading } = useAuth();
    const tenant = useTenant();
    const allowed = tenant.canManageSharedWhatsApp(user);

    useEffect(() => {
        if (loading || tenant.loading) return;
        if (!user) {
            router.replace('/login');
            return;
        }
        if (!allowed) {
            router.replace('/');
        }
    }, [allowed, loading, router, tenant.loading, user]);

    if (loading || tenant.loading || !user || !allowed) {
        return null;
    }

    return children;
}
