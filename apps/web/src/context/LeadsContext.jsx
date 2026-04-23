'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';
import { useAuth } from './AuthContext';

const LeadsContext = createContext(null);
const TEAM_ACCESS_ROLES = new Set(['admin', 'root_admin', 'client_admin', 'supervisor']);
const EMPTY_TEAM_STATS = {
    roleLabel: '',
    summary: {
        supervisors: 0,
        sales: 0,
        totalLeads: 0,
        closed: 0,
        hot: 0,
        pending: 0,
        closeRate: 0,
    },
    groups: [],
};
const EMPTY_LEAD_SOURCES = [];

function normalizeTeamStatsPayload(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return EMPTY_TEAM_STATS;
    }

    return {
        roleLabel: input.roleLabel || '',
        summary: {
            ...EMPTY_TEAM_STATS.summary,
            ...(input.summary && typeof input.summary === 'object' ? input.summary : {}),
        },
        groups: Array.isArray(input.groups) ? input.groups : [],
    };
}

function normalizeLead(input) {
    if (!input) {
        return null;
    }

    const customerPipeline = Array.isArray(input.customerPipeline) ? input.customerPipeline : [];
    const derivedPipelineCompletedCount = customerPipeline.filter(
        (item) => item?.isChecked || item?.status === 'done'
    ).length;
    const derivedPipelineTotalSteps = customerPipeline.length;

    return {
        ...input,
        flowStatus: input.flowStatus || 'open',
        salesStatus: input.salesStatus || null,
        validated: Boolean(input.validated),
        domicileCity: input.domicileCity || null,
        interestUnitId: input.interestUnitId || null,
        interestProjectType: input.interestProjectType || null,
        interestUnitName: input.interestUnitName || null,
        resultStatus: input.resultStatus || null,
        rejectedReason: input.rejectedReason || null,
        rejectedNote: input.rejectedNote || null,
        acceptedAt: input.acceptedAt || null,
        appointmentTag: input.appointmentTag || 'none',
        latestAppointment: input.latestAppointment || null,
        customerPipelineCompletedCount: Number(input.customerPipelineCompletedCount ?? derivedPipelineCompletedCount ?? 0),
        customerPipelineTotalSteps: Number(input.customerPipelineTotalSteps ?? derivedPipelineTotalSteps ?? 0),
        customerPipeline,
        activities: Array.isArray(input.activities) ? input.activities : [],
        appointments: Array.isArray(input.appointments) ? input.appointments : [],
    };
}

function mergeLeadSummary(base, incoming) {
    return {
        ...base,
        ...incoming,
        activities: Array.isArray(incoming.activities)
            ? incoming.activities
            : base.activities || [],
        appointments: Array.isArray(incoming.appointments)
            ? incoming.appointments
            : base.appointments || [],
    };
}

export function LeadsProvider({ children }) {
    const { user, loading: authLoading } = useAuth();

    const [leads, setLeads] = useState([]);
    const [leadDetails, setLeadDetails] = useState({});
    const [salesUsers, setSalesUsers] = useState([]);
    const [teamStats, setTeamStats] = useState(EMPTY_TEAM_STATS);
    const [appointments, setAppointments] = useState([]);
    const [leadSources, setLeadSources] = useState(EMPTY_LEAD_SOURCES);
    const [dashboardAnalytics, setDashboardAnalytics] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const syncLeadToState = useCallback((lead) => {
        const normalized = normalizeLead(lead);
        if (!normalized) {
            return null;
        }

        setLeads((prev) => {
            const idx = prev.findIndex((item) => item.id === normalized.id);
            if (idx === -1) {
                return [normalized, ...prev];
            }
            const next = [...prev];
            next[idx] = mergeLeadSummary(prev[idx], normalized);
            return next;
        });

        setLeadDetails((prev) => ({
            ...prev,
            [normalized.id]: mergeLeadSummary(prev[normalized.id] || {}, normalized),
        }));

        return normalized;
    }, []);

    const refreshLeads = useCallback(async () => {
        if (!user) {
            return [];
        }
        const rows = await apiRequest('/api/leads', { user });
        const normalized = Array.isArray(rows) ? rows.map(normalizeLead) : [];
        setLeads(normalized);
        return normalized;
    }, [user]);

    const refreshSalesUsers = useCallback(async () => {
        if (!user) {
            return [];
        }
        const rows = await apiRequest('/api/sales', { user });
        const normalized = Array.isArray(rows) ? rows : [];
        setSalesUsers(normalized);
        return normalized;
    }, [user]);

    const refreshTeamStats = useCallback(async () => {
        if (!user || !TEAM_ACCESS_ROLES.has(user.role)) {
            setTeamStats(EMPTY_TEAM_STATS);
            return EMPTY_TEAM_STATS;
        }
        const rows = await apiRequest('/api/team', { user });
        const normalized = normalizeTeamStatsPayload(rows);
        setTeamStats(normalized);
        return normalized;
    }, [user]);

    const refreshAppointments = useCallback(async () => {
        if (!user) {
            setAppointments([]);
            return [];
        }

        const rows = await apiRequest('/api/appointments', { user });
        const normalized = Array.isArray(rows) ? rows : [];
        setAppointments(normalized);
        return normalized;
    }, [user]);

    const refreshLeadSources = useCallback(async () => {
        if (!user) {
            setLeadSources(EMPTY_LEAD_SOURCES);
            return EMPTY_LEAD_SOURCES;
        }

        const rows = await apiRequest('/api/lead-sources', { user });
        const normalized = Array.isArray(rows) ? rows : EMPTY_LEAD_SOURCES;
        setLeadSources(normalized);
        return normalized;
    }, [user]);

    const refreshDashboardAnalytics = useCallback(async () => {
        if (!user) {
            setDashboardAnalytics(null);
            return null;
        }

        const data = await apiRequest('/api/dashboard/home-analytics', { user });
        setDashboardAnalytics(data || null);
        return data || null;
    }, [user]);

    const refreshAll = useCallback(async () => {
        if (!user) {
            setLeads([]);
            setLeadDetails({});
            setSalesUsers([]);
            setTeamStats(EMPTY_TEAM_STATS);
            setAppointments([]);
            setLeadSources(EMPTY_LEAD_SOURCES);
            setDashboardAnalytics(null);
            return;
        }
        setLoading(true);
        try {
            await Promise.all([
                refreshLeads(),
                refreshSalesUsers(),
                refreshTeamStats(),
                refreshAppointments(),
                refreshLeadSources(),
                refreshDashboardAnalytics(),
            ]);
            setError('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed loading data');
        } finally {
            setLoading(false);
        }
    }, [refreshLeads, refreshSalesUsers, refreshTeamStats, refreshAppointments, refreshDashboardAnalytics, refreshLeadSources, user]);

    useEffect(() => {
        if (authLoading) {
            return;
        }
        void refreshAll();
    }, [authLoading, refreshAll, user?.id, user?.role]);

    const loadLeadById = useCallback(async (id) => {
        if (!user || !id) {
            return null;
        }
        const detail = await apiRequest(`/api/leads/${id}`, { user });
        return syncLeadToState(detail);
    }, [syncLeadToState, user]);

    const getLeadsForUser = useCallback((_userId, _role) => {
        // Backend already returns scope based on role.
        return leads;
    }, [leads]);

    const getLeadById = useCallback((id) => {
        return leadDetails[id] || leads.find((item) => item.id === id) || null;
    }, [leadDetails, leads]);

    const updateLead = useCallback(async (id, updates) => {
        if (!user) {
            throw new Error('Unauthorized');
        }
        const updated = await apiRequest(`/api/leads/${id}`, {
            method: 'PATCH',
            user,
            body: updates,
        });
        const normalized = syncLeadToState(updated);
        await Promise.all([
            refreshLeads(),
            refreshTeamStats(),
            refreshDashboardAnalytics(),
            refreshAppointments(),
        ]);
        return normalized;
    }, [refreshAppointments, refreshDashboardAnalytics, refreshLeads, refreshTeamStats, syncLeadToState, user]);

    const acceptLead = useCallback(async (id) => {
        if (!user) {
            throw new Error('Unauthorized');
        }

        const updated = await apiRequest(`/api/leads/${id}/accept`, {
            method: 'POST',
            user,
        });

        const normalized = syncLeadToState(updated);
        await Promise.all([
            refreshLeads(),
            refreshTeamStats(),
            refreshDashboardAnalytics(),
            refreshAppointments(),
        ]);
        return normalized;
    }, [refreshAppointments, refreshDashboardAnalytics, refreshLeads, refreshTeamStats, syncLeadToState, user]);

    const completeCustomerPipelineStep = useCallback(async (leadId, stepNo, note) => {
        if (!user) {
            throw new Error('Unauthorized');
        }

        await apiRequest(`/api/leads/${leadId}/customer-pipeline/${stepNo}/complete`, {
            method: 'POST',
            user,
            body: {
                note,
            },
        });

        const detail = await loadLeadById(leadId);
        await Promise.all([
            refreshLeads(),
            refreshTeamStats(),
            refreshDashboardAnalytics(),
            refreshAppointments(),
        ]);
        return detail;
    }, [loadLeadById, refreshAppointments, refreshDashboardAnalytics, refreshLeads, refreshTeamStats, user]);

    const addLead = useCallback(async (leadData) => {
        if (!user) {
            throw new Error('Unauthorized');
        }
        const created = await apiRequest('/api/leads', {
            method: 'POST',
            user,
            body: leadData,
        });
        const normalized = syncLeadToState(created);
        await Promise.all([
            refreshLeads(),
            refreshTeamStats(),
            refreshDashboardAnalytics(),
        ]);
        return normalized;
    }, [refreshDashboardAnalytics, refreshLeads, refreshTeamStats, syncLeadToState, user]);

    const deleteLead = useCallback(async (leadId, passwordConfirmation) => {
        if (!user) {
            throw new Error('Unauthorized');
        }

        const deleted = await apiRequest(`/api/leads/${leadId}`, {
            method: 'DELETE',
            user,
            body: {
                passwordConfirmation,
            },
        });

        setLeads((prev) => prev.filter((item) => item.id !== leadId));
        setLeadDetails((prev) => {
            const next = { ...prev };
            delete next[leadId];
            return next;
        });

        await Promise.all([
            refreshLeads(),
            refreshAppointments(),
            refreshDashboardAnalytics(),
            refreshTeamStats(),
        ]);

        return deleted;
    }, [refreshAppointments, refreshDashboardAnalytics, refreshLeads, refreshTeamStats, user]);

    const addAppointment = useCallback(async (leadId, payload) => {
        if (!user) {
            throw new Error('Unauthorized');
        }
        await apiRequest(`/api/leads/${leadId}/appointments`, {
            method: 'POST',
            user,
            body: payload,
        });
        const detail = await loadLeadById(leadId);
        await Promise.all([
            refreshLeads(),
            refreshTeamStats(),
            refreshDashboardAnalytics(),
            refreshAppointments(),
        ]);
        return detail;
    }, [loadLeadById, refreshAppointments, refreshDashboardAnalytics, refreshLeads, refreshTeamStats, user]);

    const createSalesUser = useCallback(async (payload) => {
        if (!user) {
            throw new Error('Unauthorized');
        }
        const created = await apiRequest('/api/sales', {
            method: 'POST',
            user,
            body: payload,
        });
        await Promise.all([refreshSalesUsers(), refreshTeamStats()]);
        return created;
    }, [refreshSalesUsers, refreshTeamStats, user]);

    const updateAppointment = useCallback(async (appointmentId, payload) => {
        if (!user) {
            throw new Error('Unauthorized');
        }

        const updated = await apiRequest(`/api/appointments/${appointmentId}`, {
            method: 'PATCH',
            user,
            body: payload,
        });

        if (updated?.leadId) {
            await loadLeadById(updated.leadId);
        }

        await Promise.all([
            refreshLeads(),
            refreshAppointments(),
            refreshDashboardAnalytics(),
            refreshTeamStats(),
        ]);

        return updated;
    }, [loadLeadById, refreshAppointments, refreshDashboardAnalytics, refreshLeads, refreshTeamStats, user]);

    const cancelAppointment = useCallback(async (appointmentId, payload = {}) => {
        if (!user) {
            throw new Error('Unauthorized');
        }

        const updated = await apiRequest(`/api/appointments/${appointmentId}/cancel`, {
            method: 'POST',
            user,
            body: payload,
        });

        if (updated?.leadId) {
            await loadLeadById(updated.leadId);
        }

        await Promise.all([
            refreshLeads(),
            refreshAppointments(),
            refreshDashboardAnalytics(),
            refreshTeamStats(),
        ]);

        return updated;
    }, [loadLeadById, refreshAppointments, refreshDashboardAnalytics, refreshLeads, refreshTeamStats, user]);

    const getSalesUsers = useCallback(() => salesUsers, [salesUsers]);
    const getLeadSources = useCallback(() => leadSources, [leadSources]);

    const getStats = useCallback(() => {
        return {
            total: leads.length,
            hot: leads.filter((item) => item.salesStatus === 'hot').length,
            closed: leads.filter((item) => item.resultStatus === 'akad' || item.resultStatus === 'full_book').length,
            assigned: leads.filter((item) => item.flowStatus === 'assigned').length,
            open: leads.filter((item) => item.flowStatus === 'open').length,
            menunggu: leads.filter((item) => item.resultStatus === 'reserve' || item.resultStatus === 'on_process').length,
            batal: leads.filter((item) => item.resultStatus === 'cancel').length,
        };
    }, [leads]);

    const resetData = useCallback(async () => {
        await refreshAll();
    }, [refreshAll]);

    const value = useMemo(() => ({
        leads,
        loading,
        error,
        appointments,
        leadSources,
        dashboardAnalytics,
        getLeadsForUser,
        getLeadById,
        loadLeadById,
        updateLead,
        acceptLead,
        completeCustomerPipelineStep,
        addLead,
        deleteLead,
        addAppointment,
        updateAppointment,
        cancelAppointment,
        getSalesUsers,
        getLeadSources,
        getStats,
        resetData,
        refreshAll,
        refreshLeads,
        refreshSalesUsers,
        refreshAppointments,
        refreshLeadSources,
        refreshDashboardAnalytics,
        teamStats,
        refreshTeamStats,
        createSalesUser,
    }), [
        addAppointment,
        addLead,
        deleteLead,
        appointments,
        cancelAppointment,
        createSalesUser,
        dashboardAnalytics,
        error,
        getLeadById,
        getLeadsForUser,
        getLeadSources,
        getSalesUsers,
        getStats,
        leads,
        loadLeadById,
        loading,
        leadSources,
        acceptLead,
        completeCustomerPipelineStep,
        refreshAll,
        refreshAppointments,
        refreshDashboardAnalytics,
        refreshLeads,
        refreshLeadSources,
        refreshSalesUsers,
        refreshTeamStats,
        resetData,
        teamStats,
        updateAppointment,
        updateLead,
    ]);

    return (
        <LeadsContext.Provider value={value}>
            {children}
        </LeadsContext.Provider>
    );
}

export const useLeads = () => {
    const ctx = useContext(LeadsContext);
    if (!ctx) {
        throw new Error('useLeads must be used within LeadsProvider');
    }
    return ctx;
};
