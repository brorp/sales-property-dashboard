'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { INITIAL_LEADS, USERS } from '../data/mockData';

const LeadsContext = createContext(null);

export function LeadsProvider({ children }) {
    const [leads, setLeads] = useState([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('pl_leads');
        if (saved) {
            try { setLeads(JSON.parse(saved)); } catch { setLeads(INITIAL_LEADS); }
        } else {
            setLeads(INITIAL_LEADS);
        }
        setLoaded(true);
    }, []);

    useEffect(() => {
        if (loaded) localStorage.setItem('pl_leads', JSON.stringify(leads));
    }, [leads, loaded]);

    const getLeadsForUser = useCallback((userId, role) => {
        if (role === 'admin') return leads;
        return leads.filter(l => l.assignedTo === userId);
    }, [leads]);

    const getLeadById = useCallback((id) => leads.find(l => l.id === id) || null, [leads]);

    const updateLead = useCallback((id, updates) => {
        setLeads(prev => prev.map(l => {
            if (l.id !== id) return l;
            const updated = { ...l, ...updates };
            if (updates.progress && updates.progress !== l.progress) {
                updated.activities = [
                    { id: Date.now(), type: updates.progress, note: updates.activityNote || `Status diubah ke ${updates.progress}`, timestamp: new Date().toISOString() },
                    ...(l.activities || [])
                ];
            }
            if (updates.activityNote && !updates.progress) {
                updated.activities = [
                    { id: Date.now(), type: 'note', note: updates.activityNote, timestamp: new Date().toISOString() },
                    ...(l.activities || [])
                ];
            }
            delete updated.activityNote;
            return updated;
        }));
    }, []);

    const addLead = useCallback((leadData) => {
        const newLead = {
            id: `lead-${Date.now()}`, ...leadData,
            createdAt: new Date().toISOString(), clientStatus: 'warm', progress: 'new',
            activities: [{ id: Date.now(), type: 'new', note: 'Lead baru ditambahkan', timestamp: new Date().toISOString() }],
            appointments: [],
        };
        setLeads(prev => [newLead, ...prev]);
        return newLead;
    }, []);

    const addAppointment = useCallback((leadId, appointment) => {
        setLeads(prev => prev.map(l => {
            if (l.id !== leadId) return l;
            return {
                ...l, progress: 'appointment',
                appointments: [...(l.appointments || []), { id: Date.now(), ...appointment }],
                activities: [
                    { id: Date.now(), type: 'appointment', note: `Appointment dibuat: ${appointment.date} ${appointment.time} di ${appointment.location}`, timestamp: new Date().toISOString() },
                    ...(l.activities || [])
                ]
            };
        }));
    }, []);

    const getSalesUsers = useCallback(() => USERS.filter(u => u.role === 'sales'), []);

    const getStats = useCallback((userId, role) => {
        const data = role === 'admin' ? leads : leads.filter(l => l.assignedTo === userId);
        return {
            total: data.length,
            hot: data.filter(l => l.clientStatus === 'hot').length,
            warm: data.filter(l => l.clientStatus === 'warm').length,
            cold: data.filter(l => l.clientStatus === 'cold').length,
            closed: data.filter(l => l.progress === 'closed').length,
            pending: data.filter(l => l.progress === 'pending').length,
            followUp: data.filter(l => l.progress === 'follow-up').length,
            appointment: data.filter(l => l.progress === 'appointment').length,
            new: data.filter(l => l.progress === 'new').length,
        };
    }, [leads]);

    const resetData = useCallback(() => {
        setLeads(INITIAL_LEADS);
        localStorage.removeItem('pl_leads');
    }, []);

    return (
        <LeadsContext.Provider value={{ leads, getLeadsForUser, getLeadById, updateLead, addLead, addAppointment, getSalesUsers, getStats, resetData }}>
            {children}
        </LeadsContext.Provider>
    );
}

export const useLeads = () => {
    const ctx = useContext(LeadsContext);
    if (!ctx) throw new Error('useLeads must be used within LeadsProvider');
    return ctx;
};
