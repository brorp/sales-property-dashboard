'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import { apiRequest, getApiBaseUrl } from '../lib/api';
import {
    getSeenLeadsAt,
    getSeenLogsAt,
    hasUnreadSince,
    markLeadsSeenAt,
    markLogsSeenAt,
} from '../lib/notification-seen';
import { usePagePolling } from './usePagePolling';
import { normalizeResultStatusKey } from '../constants/crm';

const getLeadResultStatus = (lead) => {
    return normalizeResultStatusKey(lead?.resultStatus);
};

const hasFilledResultStatus = (lead) => Boolean(getLeadResultStatus(lead));

const NavDataContext = createContext(null);

const ADMIN_ROLES = new Set(['root_admin', 'client_admin', 'admin']);

function isAdminRole(role) {
    return ADMIN_ROLES.has(role);
}

function isLeadOpenOrUnassigned(lead) {
    const flowStatus = String(lead?.flowStatus || '').trim().toLowerCase();
    return !lead?.assignedTo || flowStatus === 'open';
}

export function NavDataProvider({ children }) {
    const { user } = useAuth();
    const pathname = usePathname();
    const { leads: allLeads } = useLeads();
    const [summary, setSummary] = useState({ latestLeadAt: null, latestLogAt: null });
    const [seenState, setSeenState] = useState({ leads: null, logs: null });
    const [dailyApiCounts, setDailyApiCounts] = useState({ newLeadCount: 0, followUpCount: 0, deadlineLeadCount: 0, activeAppointmentsCount: 0, visibleValidatedHotCount: 0 });
    const [spvApiCounts, setSpvApiCounts] = useState({ pendingCount: 0, submittedCount: 0, deadlineCount: 0, appointmentCount: 0 });
    const [whatsappStatus, setWhatsappStatus] = useState(null);
    const [teamSuspendedCount, setTeamSuspendedCount] = useState(0);

    const loadNotificationSummary = useCallback(async () => {
        if (!user) return;
        const data = await apiRequest('/api/notifications/summary', { user });
        setSummary({ latestLeadAt: data?.latestLeadAt || null, latestLogAt: data?.latestLogAt || null });
    }, [user]);

    const loadDailyTaskCounts = useCallback(async () => {
        if (!user || user.role !== 'sales') {
            setDailyApiCounts({ newLeadCount: 0, followUpCount: 0, deadlineLeadCount: 0, activeAppointmentsCount: 0, visibleValidatedHotCount: 0 });
            return;
        }
        try {
            const [data, appointmentsData, validatedHotData] = await Promise.all([
                apiRequest('/api/daily-tasks', { user }).catch(() => null),
                apiRequest('/api/appointments', { user }).catch(() => []),
                apiRequest('/api/supervisor-tasks/validated-hot', { user }).catch(() => []),
            ]);

            const newLeadCount = Array.isArray(data?.newLeads)
                ? data.newLeads.filter((item) => item.salesStatus !== 'skip').length
                : 0;

            const followUpCount = Array.isArray(data?.followUps)
                ? data.followUps.filter((item) => item.salesStatus !== 'skip').length
                : 0;

            const deadlineLeadCount = Array.isArray(data?.deadlineLeads)
                ? data.deadlineLeads.filter((item) => item.salesStatus !== 'skip').length
                : 0;

            const activeAppointmentsCount = Array.isArray(appointmentsData)
                ? appointmentsData.filter((item) => item.status === 'mau_survey').length
                : 0;

            const visibleValidatedHotCount = Array.isArray(validatedHotData)
                ? validatedHotData.filter((lead) => !hasFilledResultStatus(lead)).length
                : 0;

            setDailyApiCounts({
                newLeadCount,
                followUpCount,
                deadlineLeadCount,
                activeAppointmentsCount,
                visibleValidatedHotCount
            });
        } catch (err) {
            setDailyApiCounts({ newLeadCount: 0, followUpCount: 0, deadlineLeadCount: 0, activeAppointmentsCount: 0, visibleValidatedHotCount: 0 });
        }
    }, [user]);

    const taskCounts = useMemo(() => {
        if (!user || user.role !== 'sales') {
            return { totalCount: 0, newLeadCount: 0, followUpCount: 0 };
        }

        const transactionLeadsCount = Array.isArray(allLeads)
            ? allLeads.filter((lead) => 
                lead.assignedTo === user.id && 
                ['reserve', 'full_book'].includes(getLeadResultStatus(lead))
              ).length
            : 0;

        const totalCount =
            dailyApiCounts.newLeadCount +
            dailyApiCounts.followUpCount +
            dailyApiCounts.deadlineLeadCount +
            dailyApiCounts.activeAppointmentsCount +
            dailyApiCounts.visibleValidatedHotCount +
            transactionLeadsCount;

        return {
            totalCount,
            newLeadCount: dailyApiCounts.newLeadCount,
            followUpCount: dailyApiCounts.followUpCount
        };
    }, [user, allLeads, dailyApiCounts]);

    const leadActionCount = useMemo(() => {
        if (!user || !Array.isArray(allLeads)) return 0;
        return allLeads.filter(isLeadOpenOrUnassigned).length;
    }, [user, allLeads]);

    const loadSupervisorTaskCount = useCallback(async () => {
        if (!user || user.role !== 'supervisor') return;
        try {
            const [pendingData, submittedData, deadlineData, appointmentData] = await Promise.all([
                apiRequest('/api/supervisor-tasks', { user }).catch(() => []),
                apiRequest('/api/supervisor-tasks/submitted-daily-tasks', { user }).catch(() => []),
                apiRequest('/api/supervisor-tasks/deadline-leads', { user }).catch(() => []),
                apiRequest('/api/appointments', { user }).catch(() => []),
            ]);

            const pendingCount = Array.isArray(pendingData) ? pendingData.length : 0;

            const submittedCount = Array.isArray(submittedData)
                ? submittedData.reduce((total, group) => {
                    let c = 0;
                    for (const task of group.tasks || []) {
                        if (task.taskType === 'new_lead') c += 1;
                        if (task.taskType === 'follow_up' && [1, 2, 3].includes(Number(task.followupStage))) c += 1;
                    }
                    return total + c;
                }, 0)
                : 0;

            const deadlineCount = Array.isArray(deadlineData)
                ? deadlineData.reduce((total, group) => total + (group.tasks || []).length, 0)
                : 0;

            const appointmentCount = Array.isArray(appointmentData)
                ? appointmentData.filter((item) => item.status === 'mau_survey').length
                : 0;

            setSpvApiCounts({
                pendingCount,
                submittedCount,
                deadlineCount,
                appointmentCount,
            });
        } catch {}
    }, [user]);

    const loadWhatsappStatus = useCallback(async () => {
        if (!user || !isAdminRole(user.role)) {
            setWhatsappStatus(null);
            return;
        }

        const adminToken = process.env.NEXT_PUBLIC_ADMIN_WHATSAPP_TOKEN || '';
        try {
            const res = await fetch(`${getApiBaseUrl()}/api/whatsapp-admin/status`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(adminToken ? { 'x-admin-token': adminToken } : {}),
                },
            });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            const data = await res.json();
            setWhatsappStatus(data?.status || 'unknown');
        } catch {
            setWhatsappStatus('error');
        }
    }, [user]);

    const loadTeamSuspendedCount = useCallback(async () => {
        if (!user || !['root_admin', 'client_admin', 'admin', 'supervisor'].includes(user.role)) {
            setTeamSuspendedCount(0);
            return;
        }

        try {
            const data = await apiRequest('/api/team', { user });
            setTeamSuspendedCount(Number(data?.summary?.suspendedSales || 0));
        } catch {
            setTeamSuspendedCount(0);
        }
    }, [user]);

    const supervisorTaskCount = useMemo(() => {
        if (!user || user.role !== 'supervisor') return 0;

        const validatedHotCount = Array.isArray(allLeads)
            ? allLeads.filter((l) => l.salesStatus === 'hot' && l.validated === true && !getLeadResultStatus(l)).length
            : 0;

        const transactionCount = Array.isArray(allLeads)
            ? allLeads.filter((lead) => ['reserve', 'full_book'].includes(getLeadResultStatus(lead))).length
            : 0;

        return (
            spvApiCounts.pendingCount +
            validatedHotCount +
            spvApiCounts.submittedCount +
            spvApiCounts.deadlineCount +
            spvApiCounts.appointmentCount +
            transactionCount
        );
    }, [user, allLeads, spvApiCounts]);

    useEffect(() => {
        if (!user) return;
        setSeenState({ leads: getSeenLeadsAt(), logs: getSeenLogsAt() });
        void loadNotificationSummary();
        void loadDailyTaskCounts();
        void loadSupervisorTaskCount();
        void loadWhatsappStatus();
        void loadTeamSuspendedCount();
    }, [loadDailyTaskCounts, loadNotificationSummary, loadSupervisorTaskCount, loadTeamSuspendedCount, loadWhatsappStatus, user]);

    usePagePolling({
        enabled: Boolean(user),
        intervalMs: 3000,
        run: async () => {
            await loadNotificationSummary();
            await loadDailyTaskCounts();
            await loadSupervisorTaskCount();
            await loadWhatsappStatus();
            await loadTeamSuspendedCount();
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
    const hasWhatsappIssue = Boolean(user && isAdminRole(user.role) && whatsappStatus && whatsappStatus !== 'connected');
    const navNotificationCount = user?.role === 'sales'
        ? taskCounts.totalCount
        : user?.role === 'supervisor'
            ? supervisorTaskCount
            : leadActionCount;

    return (
        <NavDataContext.Provider
            value={{
                hasUnreadLeads,
                hasUnreadLogs,
                taskCounts,
                supervisorTaskCount,
                leadActionCount,
                teamSuspendedCount,
                navNotificationCount,
                hasWhatsappIssue,
                whatsappStatus,
            }}
        >
            {children}
        </NavDataContext.Provider>
    );
}

export function useNavData() {
    const ctx = useContext(NavDataContext);
    if (!ctx) throw new Error('useNavData must be used within NavDataProvider');
    return ctx;
}
