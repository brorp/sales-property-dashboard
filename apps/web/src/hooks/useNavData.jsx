'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import {
    getSeenLeadsAt,
    getSeenLogsAt,
    hasUnreadSince,
    markLeadsSeenAt,
    markLogsSeenAt,
} from '../lib/notification-seen';
import { usePagePolling } from './usePagePolling';

const NavDataContext = createContext(null);

export function NavDataProvider({ children }) {
    const { user } = useAuth();
    const pathname = usePathname();
    const [summary, setSummary] = useState({ latestLeadAt: null, latestLogAt: null });
    const [seenState, setSeenState] = useState({ leads: null, logs: null });
    const [taskCounts, setTaskCounts] = useState({ totalCount: 0, newLeadCount: 0, followUpCount: 0 });
    const [supervisorTaskCount, setSupervisorTaskCount] = useState(0);

    const loadNotificationSummary = useCallback(async () => {
        if (!user) return;
        const data = await apiRequest('/api/notifications/summary', { user });
        setSummary({ latestLeadAt: data?.latestLeadAt || null, latestLogAt: data?.latestLogAt || null });
    }, [user]);

    const loadDailyTaskCounts = useCallback(async () => {
        if (!user || user.role !== 'sales') {
            setTaskCounts({ totalCount: 0, newLeadCount: 0, followUpCount: 0 });
            return;
        }
        const data = await apiRequest('/api/daily-tasks/counts', { user });
        setTaskCounts({
            totalCount: Number(data?.totalCount || 0),
            newLeadCount: Number(data?.newLeadCount || 0),
            followUpCount: Number(data?.followUpCount || 0),
        });
    }, [user]);

    const loadSupervisorTaskCount = useCallback(async () => {
        if (!user || user.role !== 'supervisor') return;
        try {
            const data = await apiRequest('/api/supervisor-tasks', { user });
            setSupervisorTaskCount(Array.isArray(data) ? data.length : 0);
        } catch {}
    }, [user]);

    useEffect(() => {
        if (!user) return;
        setSeenState({ leads: getSeenLeadsAt(), logs: getSeenLogsAt() });
        void loadNotificationSummary();
        void loadDailyTaskCounts();
        void loadSupervisorTaskCount();
    }, [loadDailyTaskCounts, loadNotificationSummary, loadSupervisorTaskCount, user]);

    usePagePolling({
        enabled: Boolean(user),
        intervalMs: 3000,
        run: async () => {
            await loadNotificationSummary();
            await loadDailyTaskCounts();
            await loadSupervisorTaskCount();
        },
    });

    useEffect(() => {
        if (pathname.startsWith('/leads')) {
            const nextValue = summary.latestLeadAt || new Date().toISOString();
            markLeadsSeenAt(nextValue);
            setSeenState((prev) => ({ ...prev, leads: nextValue }));
        }
        if (pathname.startsWith('/activity-logs')) {
            const nextValue = summary.latestLogAt || new Date().toISOString();
            markLogsSeenAt(nextValue);
            setSeenState((prev) => ({ ...prev, logs: nextValue }));
        }
    }, [pathname, summary.latestLeadAt, summary.latestLogAt]);

    const hasUnreadLeads = hasUnreadSince(summary.latestLeadAt, seenState.leads);
    const hasUnreadLogs = hasUnreadSince(summary.latestLogAt, seenState.logs);

    return (
        <NavDataContext.Provider value={{ hasUnreadLeads, hasUnreadLogs, taskCounts, supervisorTaskCount }}>
            {children}
        </NavDataContext.Provider>
    );
}

export function useNavData() {
    const ctx = useContext(NavDataContext);
    if (!ctx) throw new Error('useNavData must be used within NavDataProvider');
    return ctx;
}
