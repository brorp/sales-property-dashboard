'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

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
