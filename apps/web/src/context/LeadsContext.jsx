'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';
import { useAuth } from './AuthContext';

const LeadsContext = createContext(null);

function normalizeLead(input) {
    if (!input) {
        return null;
    }

    return {
        ...input,
        flowStatus: input.flowStatus || 'open',
        salesStatus: input.salesStatus || null,
        domicileCity: input.domicileCity || null,
        resultStatus: input.resultStatus || null,
        rejectedReason: input.rejectedReason || null,
        rejectedNote: input.rejectedNote || null,
        appointmentTag: input.appointmentTag || 'none',
        latestAppointment: input.latestAppointment || null,
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
    const [teamStats, setTeamStats] = useState([]);
    const [appointments, setAppointments] = useState([]);
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
        if (!user || user.role !== 'admin') {
            setTeamStats([]);
            return [];
        }
        const rows = await apiRequest('/api/team', { user });
        const normalized = Array.isArray(rows) ? rows : [];
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
            setTeamStats([]);
            setAppointments([]);
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
                refreshDashboardAnalytics(),
            ]);
            setError('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed loading data');
        } finally {
            setLoading(false);
        }
    }, [refreshLeads, refreshSalesUsers, refreshTeamStats, refreshAppointments, refreshDashboardAnalytics, user]);

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

    const getSalesUsers = useCallback(() => salesUsers, [salesUsers]);

    const getStats = useCallback(() => {
        return {
            total: leads.length,
            hot: leads.filter((item) => item.salesStatus === 'hot').length,
            closed: leads.filter((item) => item.resultStatus === 'closing').length,
            assigned: leads.filter((item) => item.flowStatus === 'assigned').length,
            open: leads.filter((item) => item.flowStatus === 'open').length,
            menunggu: leads.filter((item) => item.resultStatus === 'menunggu').length,
            batal: leads.filter((item) => item.resultStatus === 'batal').length,
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
        dashboardAnalytics,
        getLeadsForUser,
        getLeadById,
        loadLeadById,
        updateLead,
        addLead,
        addAppointment,
        getSalesUsers,
        getStats,
        resetData,
        refreshAll,
        refreshLeads,
        refreshSalesUsers,
        refreshAppointments,
        refreshDashboardAnalytics,
        teamStats,
        refreshTeamStats,
        createSalesUser,
    }), [
        addAppointment,
        addLead,
        appointments,
        createSalesUser,
        dashboardAnalytics,
        error,
        getLeadById,
        getLeadsForUser,
        getSalesUsers,
        getStats,
        leads,
        loadLeadById,
        loading,
        refreshAll,
        refreshAppointments,
        refreshDashboardAnalytics,
        refreshLeads,
        refreshSalesUsers,
        refreshTeamStats,
        resetData,
        teamStats,
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
