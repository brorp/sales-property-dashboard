'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

export function useNotifications() {
    const { user } = useAuth();
    
    // States for Admin
    const [holdLeads, setHoldLeads] = useState([]);

    // States for Sales
    const [newLeads, setNewLeads] = useState([]);
    const [followUps, setFollowUps] = useState([]);
    const [deadlineLeads, setDeadlineLeads] = useState([]);
    const [appointments, setAppointments] = useState([]);
    const [validatedHot, setValidatedHot] = useState([]);

    // States for Supervisor (SPV)
    const [hotLeads, setHotLeads] = useState([]);
    const [submittedTasks, setSubmittedTasks] = useState([]);

    const [loading, setLoading] = useState(false);

    const isAdmin = user?.role === 'root_admin' || user?.role === 'client_admin';
    const isSales = user?.role === 'sales';
    const isSpv = user?.role === 'supervisor';

    const load = useCallback(async (silent = false) => {
        if (!user) return;
        if (!silent) setLoading(true);

        const fetchWithFallback = async (url, fallback) => {
            try {
                return await apiRequest(url, { user });
            } catch {
                return fallback;
            }
        };

        try {
            if (isAdmin) {
                const holdRows = await fetchWithFallback('/api/leads?flowStatus=hold', []);
                setHoldLeads(holdRows || []);
            } else if (isSales) {
                const [dailyData, apptData, hotData] = await Promise.all([
                    fetchWithFallback('/api/daily-tasks', { newLeads: [], followUps: [], deadlineLeads: [] }),
                    fetchWithFallback('/api/appointments', []),
                    fetchWithFallback('/api/supervisor-tasks/validated-hot', [])
                ]);

                setNewLeads(dailyData?.newLeads || []);
                setFollowUps(dailyData?.followUps || []);
                setDeadlineLeads(dailyData?.deadlineLeads || []);
                setAppointments((apptData || []).filter((a) => (a.status === 'mau_survey' || a.appointmentTag === 'mau_survey') && a.salesId === user.id));
                setValidatedHot(hotData || []);
            } else if (isSpv) {
                const [pendingHot, submittedData] = await Promise.all([
                    fetchWithFallback('/api/supervisor-tasks', []),
                    fetchWithFallback('/api/supervisor-tasks/submitted-daily-tasks', [])
                ]);

                setHotLeads(pendingHot || []);

                const flatSubmitted = [];
                for (const group of (submittedData || [])) {
                    if (Array.isArray(group.tasks)) {
                        for (const task of group.tasks) {
                            flatSubmitted.push({
                                ...task,
                                salesId: group.salesId,
                                salesName: group.salesName
                            });
                        }
                    }
                }
                setSubmittedTasks(flatSubmitted);
            }
        } catch (err) {
            // silently ignore
        } finally {
            if (!silent) setLoading(false);
        }
    }, [user, isAdmin, isSales, isSpv]);

    useEffect(() => {
        void load(true);
    }, [load]);

    // Calculate count based on role
    let count = 0;
    if (isAdmin) {
        count = holdLeads.length;
    } else if (isSales) {
        count = newLeads.length + followUps.length + deadlineLeads.length + appointments.length + validatedHot.length;
    } else if (isSpv) {
        count = hotLeads.length + submittedTasks.length;
    }

    return {
        holdLeads,
        newLeads,
        followUps,
        deadlineLeads,
        appointments,
        validatedHot,
        hotLeads,
        submittedTasks,
        count,
        loading,
        reload: load
    };
}
