'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

export function useNotifications() {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async (silent = false) => {
        if (!user) return;
        if (!silent) setLoading(true);
        try {
            const rows = await apiRequest('/api/appointments', { user });
            const mauSurvey = (rows || []).filter((r) => r.appointmentTag === 'mau_survey');
            setNotifications(mauSurvey);
        } catch {
            // silently ignore
        } finally {
            if (!silent) setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        void load(true);
    }, [load]);

    return { notifications, count: notifications.length, loading, reload: load };
}
