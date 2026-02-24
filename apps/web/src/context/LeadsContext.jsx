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
        layer2Status: input.layer2Status || 'prospecting',
        rejectedReason: input.rejectedReason || null,
        rejectedNote: input.rejectedNote || null,
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

    const refreshAll = useCallback(async () => {
        if (!user) {
            setLeads([]);
            setLeadDetails({});
            setSalesUsers([]);
            setTeamStats([]);
            return;
        }
        setLoading(true);
        try {
            await Promise.all([
                refreshLeads(),
                refreshSalesUsers(),
                refreshTeamStats(),
            ]);
            setError('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed loading data');
        } finally {
            setLoading(false);
        }
    }, [refreshLeads, refreshSalesUsers, refreshTeamStats, user]);

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

    const getLeadsForUser = useCallback((userId, role) => {
        if (role === 'admin') {
            return leads;
        }
        // For sales role, backend already returns only own leads.
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
        await refreshTeamStats();
        return normalized;
    }, [refreshTeamStats, syncLeadToState, user]);

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
        await refreshTeamStats();
        return normalized;
    }, [refreshTeamStats, syncLeadToState, user]);

    const addAppointment = useCallback(async (leadId, appointment) => {
        if (!user) {
            throw new Error('Unauthorized');
        }
        await apiRequest(`/api/leads/${leadId}/appointments`, {
            method: 'POST',
            user,
            body: appointment,
        });
        const detail = await loadLeadById(leadId);
        await refreshTeamStats();
        return detail;
    }, [loadLeadById, refreshTeamStats, user]);

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

    const getStats = useCallback((userId, role) => {
        const data = role === 'admin' ? leads : leads;
        return {
            total: data.length,
            hot: data.filter((item) => item.clientStatus === 'hot').length,
            warm: data.filter((item) => item.clientStatus === 'warm').length,
            cold: data.filter((item) => item.clientStatus === 'cold').length,
            closed: data.filter((item) => item.progress === 'closed').length,
            pending: data.filter((item) => item.progress === 'pending').length,
            prospecting: data.filter((item) => item.progress === 'prospecting').length,
            followUp: data.filter((item) => item.progress === 'follow-up').length,
            appointment: data.filter((item) => item.progress === 'appointment').length,
            new: data.filter((item) => item.progress === 'new').length,
            noAction: data.filter((item) => item.progress === 'no-action').length,
            layer2SudahSurvey: data.filter((item) => item.layer2Status === 'sudah_survey').length,
            layer2MauSurvey: data.filter((item) => item.layer2Status === 'mau_survey').length,
            layer2Prospecting: data.filter((item) => item.layer2Status === 'prospecting').length,
            layer2Closing: data.filter((item) => item.layer2Status === 'closing').length,
            layer2Rejected: data.filter((item) => item.layer2Status === 'rejected').length,
        };
    }, [leads]);

    const getLayer2Charts = useCallback((userId, role) => {
        const data = role === 'admin' ? leads : leads;
        const total = data.length;

        const statusItems = [
            { key: 'prospecting', label: 'Prospecting' },
            { key: 'sudah_survey', label: 'Sudah Survey' },
            { key: 'mau_survey', label: 'Mau Survey' },
            { key: 'closing', label: 'Closing' },
            { key: 'rejected', label: 'Rejected' },
        ].map((item) => {
            const count = data.filter((lead) => lead.layer2Status === item.key).length;
            return {
                ...item,
                count,
                percentage: total > 0 ? Math.round((count / total) * 10000) / 100 : 0,
            };
        });

        const rejectedLeads = data.filter((lead) => lead.layer2Status === 'rejected' && lead.rejectedReason);
        const rejectedTotal = rejectedLeads.length;
        const reasonMap = new Map();
        for (const lead of rejectedLeads) {
            const key = lead.rejectedReason || 'lainnya';
            reasonMap.set(key, (reasonMap.get(key) || 0) + 1);
        }

        const reasonItems = Array.from(reasonMap.entries())
            .map(([key, count]) => ({
                key,
                count,
                percentage: rejectedTotal > 0 ? Math.round((count / rejectedTotal) * 10000) / 100 : 0,
            }))
            .sort((a, b) => b.count - a.count);

        return {
            layer2StatusChart: { total, items: statusItems },
            rejectedReasonChart: { total: rejectedTotal, items: reasonItems },
        };
    }, [leads]);

    const resetData = useCallback(async () => {
        await refreshAll();
    }, [refreshAll]);

    const value = useMemo(() => ({
        leads,
        loading,
        error,
        getLeadsForUser,
        getLeadById,
        loadLeadById,
        updateLead,
        addLead,
        addAppointment,
        getSalesUsers,
        getStats,
        getLayer2Charts,
        resetData,
        refreshAll,
        refreshLeads,
        refreshSalesUsers,
        teamStats,
        refreshTeamStats,
        createSalesUser,
    }), [
        addAppointment,
        addLead,
        createSalesUser,
        error,
        getLayer2Charts,
        getLeadById,
        getLeadsForUser,
        getSalesUsers,
        getStats,
        leads,
        loadLeadById,
        loading,
        refreshAll,
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
