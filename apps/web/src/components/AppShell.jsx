'use client';

import BottomNav from './BottomNav';
import { useAuth } from '../context/AuthContext';

export default function AppShell({ children }) {
    const { user, loading } = useAuth();

    if (loading) {
        return null;
    }

    return (
        <>
            {children}
            {user ? <BottomNav /> : null}
        </>
    );
}
