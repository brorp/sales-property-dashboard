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
        try {
            const [data, appointmentsData, validatedHotData, leadsData] = await Promise.all([
                apiRequest('/api/daily-tasks/counts', { user }).catch(() => null),
                apiRequest('/api/appointments', { user }).catch(() => []),
                apiRequest('/api/supervisor-tasks/validated-hot', { user }).catch(() => []),
                apiRequest('/api/leads', { user }).catch(() => [])
            ]);

            const newLeadCount = Number(data?.newLeadCount || 0);
            const followUpCount = Number(data?.followUpCount || 0);
            const deadlineLeadCount = Number(data?.deadlineLeadCount || 0);

            const activeAppointmentsCount = Array.isArray(appointmentsData)
                ? appointmentsData.filter((item) => item.status === 'mau_survey').length
                : 0;

            const getLeadResultStatus = (lead) => {
                const rs = lead?.resultStatus || '';
                const v = String(rs).trim().toLowerCase();
                if (!v) return null;
                if (v === 'on_process') return 'reserve';
                if (v === 'akad') return 'lunas';
                if (v === 'cancel' || v === 'cancel_transaksi' || v === 'cancel_full_book') return 'cancel_full_book';
                if (v === 'cancel_reserve') return 'cancel_reserve';
                if (v === 'lunas' || v === 'full_book' || v === 'reserve') return v;
                return null;
            };

            const hasFilledResultStatus = (lead) => Boolean(getLeadResultStatus(lead));

            const visibleValidatedHotCount = Array.isArray(validatedHotData)
                ? validatedHotData.filter((lead) => !hasFilledResultStatus(lead)).length
                : 0;

            const transactionLeadsCount = Array.isArray(leadsData)
                ? leadsData.filter((lead) => 
                    lead.assignedTo === user.id && 
                    ['reserve', 'full_book'].includes(getLeadResultStatus(lead))
                  ).length
                : 0;

            const totalCount = newLeadCount + followUpCount + deadlineLeadCount + activeAppointmentsCount + visibleValidatedHotCount + transactionLeadsCount;

            setTaskCounts({
                totalCount,
                newLeadCount,
                followUpCount
            });
        } catch (err) {
            setTaskCounts({ totalCount: 0, newLeadCount: 0, followUpCount: 0 });
        }
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
