'use client';

import { useState, useEffect } from 'react';
import BottomNav from './BottomNav';
import Sidebar from './Sidebar';
import FloatingWorkspaceButton from './FloatingWorkspaceButton';
import { useAuth } from '../context/AuthContext';
import { NavDataProvider } from '../hooks/useNavData';
import { usePushNotification } from '../hooks/usePushNotification';

export default function AppShell({ children }) {
    const { user, loading } = useAuth();

    const [collapsed, setCollapsed] = useState(() => {
        if (typeof window === 'undefined') return false;
        return localStorage.getItem('sidebar-collapsed') === '1';
    });

    useEffect(() => {
        if (collapsed) {
            document.body.classList.add('sidebar-collapsed');
        } else {
            document.body.classList.remove('sidebar-collapsed');
        }
        return () => document.body.classList.remove('sidebar-collapsed');
    }, [collapsed]);

    const handleToggleCollapsed = () => {
        setCollapsed((prev) => {
            const next = !prev;
            localStorage.setItem('sidebar-collapsed', next ? '1' : '0');
            return next;
        });
    };

    usePushNotification({ user });

    if (loading) return null;

    return (
        <NavDataProvider>
            {children}
            {user ? <Sidebar collapsed={collapsed} onToggleCollapsed={handleToggleCollapsed} /> : null}
            {user ? <BottomNav /> : null}
            {user ? <FloatingWorkspaceButton /> : null}
        </NavDataProvider>
    );
}
