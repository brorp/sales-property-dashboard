'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

export function useNotifications() {
    const { user, isAdmin } = useAuth();
    const [appointments, setAppointments] = useState([]);
    const [holdLeads, setHoldLeads] = useState([]);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async (silent = false) => {
        if (!user) return;
        if (!silent) setLoading(true);
        try {
            const [rows, holdRows] = await Promise.all([
                apiRequest('/api/appointments', { user }),
                isAdmin ? apiRequest('/api/leads?flowStatus=hold', { user }) : Promise.resolve([]),
            ]);
            setAppointments((rows || []).filter((r) => r.appointmentTag === 'mau_survey'));
            setHoldLeads(holdRows || []);
        } catch {
            // silently ignore
        } finally {
            if (!silent) setLoading(false);
        }
    }, [user, isAdmin]);

    useEffect(() => {
        void load(true);
    }, [load]);

    const count = appointments.length + holdLeads.length;
    return { notifications: appointments, holdLeads, count, loading, reload: load };
}
