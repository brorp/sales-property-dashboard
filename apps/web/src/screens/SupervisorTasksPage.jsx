'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';
import Button from '../components/Button';
import Select from '../components/Select';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import { apiRequest } from '../lib/api';
import { usePagePolling } from '../hooks/usePagePolling';
import {
    RESULT_STATUSES,
    getResultStatusLabel,
    getSalesStatusLabel,
    getTimeAgo,
    isCancelResultStatus,
    normalizeResultStatusKey,
    toWaLink,
} from '../constants/crm';
import './SupervisorTasksPage.css';

function formatDateTime(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const IconPhone = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.78a16 16 0 0 0 6 6l1.92-1.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
);

const IconUser = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
    </svg>
);

const IconClock = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
    </svg>
);

const IconMegaphone = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11l19-9-9 19-2-8-8-2z" />
    </svg>
);

const IconNudge = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
);

function isOlderThan30Days(val) {
    if (!val) return false;
    const date = new Date(val);
    if (Number.isNaN(date.getTime())) return false;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    return Date.now() - date.getTime() > thirtyDaysMs;
}

const IconCheck = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const IconX = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

const HOT_TRANSACTION_STATUS_OPTIONS = RESULT_STATUSES.filter((item) => (
    ['reserve', 'full_book', 'lunas', 'cancel_reserve', 'cancel_full_book', 'cancel_minat'].includes(item.key)
));

function getLeadResultStatus(lead) {
    return normalizeResultStatusKey(lead?.resultStatus);
}

function SpvEmpty({ variant = 'default', title, desc }) {
    const variants = {
        loading: {
            color: '#94A3B8', bg: '#F1F5F9',
            icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="spv-empty-spin">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
            ),
        },
        success: {
            color: '#16A34A', bg: '#DCFCE7',
            icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                    <polyline points="9 12 11 14 15 10" />
                </svg>
            ),
        },
        clipboard: {
            color: '#2563EB', bg: '#DBEAFE',
            icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" />
                    <line x1="9" y1="12" x2="15" y2="12" />
                    <line x1="9" y1="16" x2="13" y2="16" />
                </svg>
            ),
        },
        snow: {
            color: '#0EA5E9', bg: '#E0F2FE',
            icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="2" x2="12" y2="22" />
                    <path d="m20 6-8 6-8-6" />
                    <path d="m20 18-8-6-8 6" />
                    <path d="m2 12 4-2-4-2" />
                    <path d="m22 12-4-2 4-2" />
                </svg>
            ),
        },
        search: {
            color: '#1E3A5F', bg: '#EEF3F9',
            icon: (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
            ),
        },
    };
    const v = variants[variant] || variants.default;
    return (
        <div className="spv-empty">
            <div className="spv-empty-icon" style={{ background: v.bg, color: v.color }}>
                {v.icon}
            </div>
            <div className="spv-empty-title">{title}</div>
            {desc ? <div className="spv-empty-desc">{desc}</div> : null}
        </div>
    );
}


export default function SupervisorTasksPage() {
    const { user } = useAuth();
    const { getLeadsForUser, updateLead, refreshLeads } = useLeads();
    const router = useRouter();
    const [activeSection, setActiveSection] = useState('hot_leads');
    const [hotSubTab, setHotSubTab] = useState('pending');
    const [hotValidatedSubTab, setHotValidatedSubTab] = useState('semua');
    const [followUpSubTab, setFollowUpSubTab] = useState('new_leads');
    const [transactionSubTab, setTransactionSubTab] = useState('reserve');
    const [leads, setLeads] = useState([]);
    const [submittedTaskGroups, setSubmittedTaskGroups] = useState([]);
    const [deadlineTaskGroups, setDeadlineTaskGroups] = useState([]);
    const [appointments, setAppointments] = useState([]);
    const [cancelReasons, setCancelReasons] = useState([]);
    const [managedSales, setManagedSales] = useState([]);
    const [submittedSalesFilter, setSubmittedSalesFilter] = useState('all');
    const [deadlineSalesFilter, setDeadlineSalesFilter] = useState('all');
    const [hotSalesFilter, setHotSalesFilter] = useState('all');
    const [appointmentSalesFilter, setAppointmentSalesFilter] = useState('all');
    const [transactionSalesFilter, setTransactionSalesFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionLoading, setActionLoading] = useState('');
    const [actionError, setActionError] = useState('');
    const [actionSuccess, setActionSuccess] = useState('');
    const [rejectNotes, setRejectNotes] = useState({});
    const [showRejectNote, setShowRejectNote] = useState({});
    const [lightboxImage, setLightboxImage] = useState(null);
    const [filterSheet, setFilterSheet] = useState(null); // 'submitted' | 'cold' | 'hot' | null
    const [filterSearch, setFilterSearch] = useState('');
    const [submittedNameSearch, setSubmittedNameSearch] = useState('');
    const [coldNameSearch, setColdNameSearch] = useState('');
    const [hotNameSearch, setHotNameSearch] = useState('');
    const [appointmentNameSearch, setAppointmentNameSearch] = useState('');
    const [transactionNameSearch, setTransactionNameSearch] = useState('');
    const [transactionDrafts, setTransactionDrafts] = useState({});

    // Hot Validated leads from context (already loaded)
    const allLeads = getLeadsForUser(user?.id, user?.role);
    const validatedLeads = useMemo(() => (
        allLeads.filter((l) => l.salesStatus === 'hot' && l.validated === true && !getLeadResultStatus(l))
    ), [allLeads]);

    const handleNudgeSales = (salesId, salesName, leadName, leadPhone) => {
        const salesMember = managedSales.find(s => s.id === salesId);
        const salesPhone = salesMember?.phone || '';
        const cleanPhone = salesPhone.replace(/[^0-9]/g, '');
        const text = `Halo ${salesName}, mohon segera menindaklanjuti Cold Lead *${leadName}* (${leadPhone}) ya. Terima kasih!`;
        const url = cleanPhone
            ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
            : `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };

    const loadLeads = useCallback(async ({ silent = false } = {}) => {
        if (!user) return;
        if (!silent) { setLoading(true); setError(''); }
        try {
            const [pendingData, submittedData, deadlineData, salesData, appointmentData, cancelReasonData] = await Promise.all([
                apiRequest('/api/supervisor-tasks', { user }),
                apiRequest('/api/supervisor-tasks/submitted-daily-tasks', { user }),
                apiRequest('/api/supervisor-tasks/deadline-leads', { user }),
                apiRequest('/api/sales', { user }),
                apiRequest('/api/appointments', { user }),
                apiRequest('/api/cancel-reasons?onlyActive=true', { user }),
            ]);
            setLeads(Array.isArray(pendingData) ? pendingData : []);
            setSubmittedTaskGroups(Array.isArray(submittedData) ? submittedData : []);
            setDeadlineTaskGroups(Array.isArray(deadlineData) ? deadlineData : []);
            setManagedSales(Array.isArray(salesData) ? salesData : []);
            setAppointments(Array.isArray(appointmentData) ? appointmentData : []);
            setCancelReasons(Array.isArray(cancelReasonData) ? cancelReasonData : []);
        } catch (err) {
            if (!silent) setError(err instanceof Error ? err.message : 'Gagal memuat data');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [user]);

    useEffect(() => { void loadLeads(); }, [loadLeads]);

    const submittedTaskCountBySalesId = useMemo(() => {
        const next = new Map();
        for (const group of submittedTaskGroups) {
            next.set(group.salesId, group.taskCount || 0);
        }
        return next;
    }, [submittedTaskGroups]);
    const submittedSalesOptions = useMemo(() => (
        (managedSales.length > 0 ? managedSales : submittedTaskGroups).map((item) => ({
            salesId: item.id || item.salesId,
            salesName: item.name || item.salesName || 'Sales',
            taskCount: submittedTaskCountBySalesId.get(item.id || item.salesId) || 0,
        })).filter((item) => item.salesId)
    ), [managedSales, submittedTaskCountBySalesId, submittedTaskGroups]);
    const visibleSubmittedTaskGroups = useMemo(() => (
        submittedSalesFilter === 'all'
            ? submittedTaskGroups
            : submittedTaskGroups.filter((group) => group.salesId === submittedSalesFilter)
    ), [submittedSalesFilter, submittedTaskGroups]);
    const visibleSubmittedTaskCount = useMemo(() => (
        visibleSubmittedTaskGroups.reduce((total, group) => total + (group.taskCount || 0), 0)
    ), [visibleSubmittedTaskGroups]);
    const deadlineTaskCountBySalesId = useMemo(() => {
        const next = new Map();
        for (const group of deadlineTaskGroups) {
            next.set(group.salesId, group.taskCount || 0);
        }
        return next;
    }, [deadlineTaskGroups]);
    const deadlineSalesOptions = useMemo(() => (
        (managedSales.length > 0 ? managedSales : deadlineTaskGroups).map((item) => ({
            salesId: item.id || item.salesId,
            salesName: item.name || item.salesName || 'Sales',
            taskCount: deadlineTaskCountBySalesId.get(item.id || item.salesId) || 0,
        })).filter((item) => item.salesId)
    ), [deadlineTaskCountBySalesId, deadlineTaskGroups, managedSales]);
    const visibleDeadlineTaskGroups = useMemo(() => (
        deadlineSalesFilter === 'all'
            ? deadlineTaskGroups
            : deadlineTaskGroups.filter((group) => group.salesId === deadlineSalesFilter)
    ), [deadlineSalesFilter, deadlineTaskGroups]);
    const visibleDeadlineTaskCount = useMemo(() => (
        visibleDeadlineTaskGroups.reduce((total, group) => total + (group.taskCount || 0), 0)
    ), [visibleDeadlineTaskGroups]);
    const submittedTotalCount = useMemo(() => (
        submittedTaskGroups.reduce((total, group) => total + (group.taskCount || 0), 0)
    ), [submittedTaskGroups]);
    const deadlineTotalCount = useMemo(() => (
        deadlineTaskGroups.reduce((total, group) => total + (group.taskCount || 0), 0)
    ), [deadlineTaskGroups]);
    const followUpTaskMatchesSubTab = useCallback((task) => {
        if (followUpSubTab === 'new_leads') return task.taskType === 'new_lead';
        if (followUpSubTab === 'follow_up_1') return task.taskType === 'follow_up' && Number(task.followupStage) === 1;
        if (followUpSubTab === 'follow_up_2') return task.taskType === 'follow_up' && Number(task.followupStage) === 2;
        if (followUpSubTab === 'follow_up_3') return task.taskType === 'follow_up' && Number(task.followupStage) === 3;
        return false;
    }, [followUpSubTab]);
    const visibleFollowUpGroups = useMemo(() => {
        if (followUpSubTab === 'deadlines') {
            return visibleDeadlineTaskGroups.map((group) => ({
                ...group,
                tasks: (group.tasks || []).filter((task) => (
                    !submittedNameSearch ||
                    task.leadName?.toLowerCase().includes(submittedNameSearch.toLowerCase())
                )),
            })).filter((group) => group.tasks.length > 0);
        }
        return visibleSubmittedTaskGroups.map((group) => ({
            ...group,
            tasks: (group.tasks || []).filter((task) => (
                followUpTaskMatchesSubTab(task) &&
                (!submittedNameSearch || task.leadName?.toLowerCase().includes(submittedNameSearch.toLowerCase()))
            )),
        })).filter((group) => group.tasks.length > 0);
    }, [followUpSubTab, followUpTaskMatchesSubTab, submittedNameSearch, visibleDeadlineTaskGroups, visibleSubmittedTaskGroups]);
    const followUpTabCounts = useMemo(() => {
        const counts = { new_leads: 0, follow_up_1: 0, follow_up_2: 0, follow_up_3: 0, deadlines: deadlineTotalCount };
        for (const group of submittedTaskGroups) {
            for (const task of group.tasks || []) {
                if (task.taskType === 'new_lead') counts.new_leads += 1;
                if (task.taskType === 'follow_up' && Number(task.followupStage) === 1) counts.follow_up_1 += 1;
                if (task.taskType === 'follow_up' && Number(task.followupStage) === 2) counts.follow_up_2 += 1;
                if (task.taskType === 'follow_up' && Number(task.followupStage) === 3) counts.follow_up_3 += 1;
            }
        }
        return counts;
    }, [deadlineTotalCount, submittedTaskGroups]);
    const activeAppointments = useMemo(() => (
        appointments.filter((appointment) => appointment.status === 'mau_survey')
    ), [appointments]);
    const appointmentSalesOptions = useMemo(() => {
        const countMap = new Map();
        for (const appointment of activeAppointments) {
            if (appointment.salesId) countMap.set(appointment.salesId, (countMap.get(appointment.salesId) || 0) + 1);
        }
        return managedSales.map((item) => ({
            salesId: item.id,
            salesName: item.name || 'Sales',
            taskCount: countMap.get(item.id) || 0,
        })).filter((item) => item.salesId);
    }, [activeAppointments, managedSales]);
    const visibleAppointments = useMemo(() => (
        activeAppointments.filter((appointment) => {
            if (appointmentSalesFilter !== 'all' && appointment.salesId !== appointmentSalesFilter) return false;
            if (!appointmentNameSearch.trim()) return true;
            const query = appointmentNameSearch.toLowerCase();
            return appointment.leadName?.toLowerCase().includes(query) || appointment.leadPhone?.toLowerCase().includes(query);
        })
    ), [activeAppointments, appointmentNameSearch, appointmentSalesFilter]);
    const transactionLeads = useMemo(() => (
        allLeads.filter((lead) => ['reserve', 'full_book'].includes(getLeadResultStatus(lead)))
    ), [allLeads]);
    const transactionSalesOptions = useMemo(() => {
        const countMap = new Map();
        for (const lead of transactionLeads) {
            if (lead.assignedTo) countMap.set(lead.assignedTo, (countMap.get(lead.assignedTo) || 0) + 1);
        }
        return managedSales.map((item) => ({
            salesId: item.id,
            salesName: item.name || 'Sales',
            taskCount: countMap.get(item.id) || 0,
        })).filter((item) => item.salesId);
    }, [managedSales, transactionLeads]);
    const visibleTransactionLeads = useMemo(() => (
        transactionLeads.filter((lead) => {
            if (getLeadResultStatus(lead) !== transactionSubTab) return false;
            if (transactionSalesFilter !== 'all' && lead.assignedTo !== transactionSalesFilter) return false;
            if (!transactionNameSearch.trim()) return true;
            const query = transactionNameSearch.toLowerCase();
            return lead.name?.toLowerCase().includes(query) || lead.phone?.toLowerCase().includes(query);
        })
    ), [transactionLeads, transactionNameSearch, transactionSalesFilter, transactionSubTab]);
    const reserveCount = transactionLeads.filter((lead) => getLeadResultStatus(lead) === 'reserve').length;
    const fullBookCount = transactionLeads.filter((lead) => getLeadResultStatus(lead) === 'full_book').length;

    const hotSalesOptions = useMemo(() => {
        const activeLeadsList = hotSubTab === 'pending' ? leads : validatedLeads;
        const countMap = new Map();
        for (const lead of activeLeadsList) {
            const sid = lead.assignedTo;
            if (sid) {
                countMap.set(sid, (countMap.get(sid) || 0) + 1);
            }
        }
        return managedSales.map((item) => ({
            salesId: item.id,
            salesName: item.name || 'Sales',
            taskCount: countMap.get(item.id) || 0,
        })).filter((item) => item.salesId);
    }, [managedSales, hotSubTab, leads, validatedLeads]);

    const filteredPendingLeads = useMemo(() => {
        return leads.filter((lead) => {
            if (hotSalesFilter !== 'all' && lead.assignedTo !== hotSalesFilter) {
                return false;
            }
            if (hotNameSearch.trim()) {
                const query = hotNameSearch.toLowerCase();
                const nameMatches = lead.name?.toLowerCase().includes(query);
                const phoneMatches = lead.phone?.toLowerCase().includes(query);
                if (!nameMatches && !phoneMatches) {
                    return false;
                }
            }
            return true;
        });
    }, [leads, hotSalesFilter, hotNameSearch]);

    const filteredValidatedLeads = useMemo(() => {
        return validatedLeads.filter((lead) => {
            if (hotSalesFilter !== 'all' && lead.assignedTo !== hotSalesFilter) {
                return false;
            }
            if (hotNameSearch.trim()) {
                const query = hotNameSearch.toLowerCase();
                const nameMatches = lead.name?.toLowerCase().includes(query);
                const phoneMatches = lead.phone?.toLowerCase().includes(query);
                if (!nameMatches && !phoneMatches) {
                    return false;
                }
            }
            return true;
        });
    }, [validatedLeads, hotSalesFilter, hotNameSearch]);

    const validatedGroupLess = useMemo(() => filteredValidatedLeads.filter((l) => !isOlderThan30Days(l.updatedAt)), [filteredValidatedLeads]);
    const validatedGroupMore = useMemo(() => filteredValidatedLeads.filter((l) => isOlderThan30Days(l.updatedAt)), [filteredValidatedLeads]);

    const hotTotalCount = useMemo(() => {
        const activeLeadsList = hotSubTab === 'pending' ? leads : validatedLeads;
        return activeLeadsList.length;
    }, [hotSubTab, leads, validatedLeads]);

    useEffect(() => {
        if (
            submittedSalesFilter !== 'all' &&
            !submittedSalesOptions.some((option) => option.salesId === submittedSalesFilter)
        ) {
            setSubmittedSalesFilter('all');
        }
    }, [submittedSalesFilter, submittedSalesOptions]);

    useEffect(() => {
        if (
            deadlineSalesFilter !== 'all' &&
            !deadlineSalesOptions.some((option) => option.salesId === deadlineSalesFilter)
        ) {
            setDeadlineSalesFilter('all');
        }
    }, [deadlineSalesFilter, deadlineSalesOptions]);

    useEffect(() => {
        if (
            hotSalesFilter !== 'all' &&
            !hotSalesOptions.some((option) => option.salesId === hotSalesFilter)
        ) {
            setHotSalesFilter('all');
        }
    }, [hotSalesFilter, hotSalesOptions]);

    usePagePolling({
        enabled: Boolean(user),
        intervalMs: 5000,
        run: async () => {
            if (actionLoading) return;
            await loadLeads({ silent: true });
        },
    });

    const handleValidate = async (leadId) => {
        setActionLoading(leadId);
        setActionError('');
        setActionSuccess('');
        try {
            await apiRequest(`/api/supervisor-tasks/${leadId}/validate`, {
                method: 'POST',
                user,
            });
            setActionSuccess('Lead berhasil divalidasi sebagai HOT | VALIDATED.');
            await loadLeads({ silent: true });
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Gagal memvalidasi lead');
        } finally {
            setActionLoading('');
        }
    };

    const handleReject = async (leadId) => {
        const note = rejectNotes[leadId] || '';
        setActionLoading(leadId);
        setActionError('');
        setActionSuccess('');
        try {
            await apiRequest(`/api/supervisor-tasks/${leadId}/reject`, {
                method: 'POST',
                user,
                body: { note },
            });
            setActionSuccess('Lead berhasil ditolak.');
            setShowRejectNote((prev) => ({ ...prev, [leadId]: false }));
            setRejectNotes((prev) => ({ ...prev, [leadId]: '' }));
            await loadLeads({ silent: true });
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Gagal menolak lead');
        } finally {
            setActionLoading('');
        }
    };

    const toggleRejectNote = (leadId) => {
        setShowRejectNote((prev) => ({ ...prev, [leadId]: !prev[leadId] }));
    };

    const mergeTransactionDraft = useCallback((leadId, partial) => {
        setTransactionDrafts((prev) => ({
            ...prev,
            [leadId]: { ...(prev[leadId] || {}), ...partial },
        }));
    }, []);

    const buildTransactionPayload = (status, draft) => {
        const payload = { resultStatus: status };
        if (status === 'lunas') {
            if (!draft?.unitName?.trim() || !draft?.unitDetail?.trim() || !draft?.paymentMethod?.trim()) {
                throw new Error('Nama unit, detail unit, dan cara bayar wajib diisi untuk Lunas.');
            }
            payload.unitName = draft.unitName.trim();
            payload.unitDetail = draft.unitDetail.trim();
            payload.paymentMethod = draft.paymentMethod.trim();
        }
        if (isCancelResultStatus(status)) {
            if (!draft?.rejectedReason) {
                throw new Error('Alasan cancel wajib dipilih.');
            }
            payload.rejectedReason = draft.rejectedReason;
            payload.rejectedNote = draft.rejectedNote?.trim() || '-';
        }
        return payload;
    };

    const handleUpdateLeadResultStatus = async (lead, status) => {
        if (!lead?.id || !status) return;
        const draft = transactionDrafts[lead.id] || {};
        mergeTransactionDraft(lead.id, { submitting: true, error: '' });
        setActionError('');
        setActionSuccess('');
        try {
            await updateLead(lead.id, buildTransactionPayload(status, draft));
            setTransactionDrafts((prev) => {
                const next = { ...prev };
                delete next[lead.id];
                return next;
            });
            setActionSuccess(`${lead.name} berhasil diubah ke ${getResultStatusLabel(status)}.`);
            await Promise.all([refreshLeads?.(), loadLeads({ silent: true })]);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Gagal update status transaksi';
            mergeTransactionDraft(lead.id, { submitting: false, error: message });
            setActionError(message);
        }
    };

    const renderTransactionStatusControls = (lead, options, placeholder = 'Update status transaksi') => {
        const draft = transactionDrafts[lead.id] || {};
        const selectedStatus = draft.resultStatus || '';
        return (
            <div className="spv-transaction-update" onClick={(event) => event.stopPropagation()}>
                <Select
                    options={options.map((item) => ({ value: item.key, label: item.label }))}
                    value={selectedStatus}
                    onChange={(value) => mergeTransactionDraft(lead.id, { resultStatus: value, error: '' })}
                    placeholder={placeholder}
                    clearable={false}
                    disabled={draft.submitting}
                />
                {isCancelResultStatus(selectedStatus) ? (
                    <>
                        <Select
                            options={cancelReasons.map((item) => ({ value: item.code, label: item.label }))}
                            value={draft.rejectedReason || ''}
                            onChange={(value) => mergeTransactionDraft(lead.id, { rejectedReason: value, error: '' })}
                            placeholder="Pilih alasan cancel"
                            clearable={false}
                            disabled={draft.submitting}
                        />
                        <textarea
                            className="input-field"
                            rows={2}
                            value={draft.rejectedNote || ''}
                            onChange={(event) => mergeTransactionDraft(lead.id, { rejectedNote: event.target.value })}
                            placeholder="Catatan cancel (opsional)"
                            disabled={draft.submitting}
                            style={{ resize: 'vertical' }}
                        />
                    </>
                ) : null}
                {selectedStatus === 'lunas' ? (
                    <>
                        <input
                            className="input-field"
                            value={draft.unitName || ''}
                            onChange={(event) => mergeTransactionDraft(lead.id, { unitName: event.target.value })}
                            placeholder="Nama unit"
                            disabled={draft.submitting}
                        />
                        <textarea
                            className="input-field"
                            rows={2}
                            value={draft.unitDetail || ''}
                            onChange={(event) => mergeTransactionDraft(lead.id, { unitDetail: event.target.value })}
                            placeholder="Detail unit"
                            disabled={draft.submitting}
                            style={{ resize: 'vertical' }}
                        />
                        <input
                            className="input-field"
                            value={draft.paymentMethod || ''}
                            onChange={(event) => mergeTransactionDraft(lead.id, { paymentMethod: event.target.value })}
                            placeholder="Cara bayar"
                            disabled={draft.submitting}
                        />
                    </>
                ) : null}
                {draft.error ? <div className="alert alert-danger" style={{ marginBottom: 0 }}>{draft.error}</div> : null}
                <Button
                    variant="primary"
                    className="btn-plcrm"
                    loading={draft.submitting}
                    loadingText="Menyimpan..."
                    disabled={!selectedStatus}
                    onClick={() => void handleUpdateLeadResultStatus(lead, selectedStatus)}
                    style={{ width: '100%', height: '38px', padding: '0 12px', fontSize: '0.875rem' }}
                >
                    Update Status
                </Button>
            </div>
        );
    };

    const closePanel = () => { setFilterSheet(null); setFilterSearch(''); };

    const renderSalesFilter = ({ options, value, onChange, totalCount, sheetKey, nameSearch, setNameSearch, compactTop = false }) => {
        if (options.length === 0) return null;
        const activeLabel = value === 'all'
            ? null
            : options.find((o) => o.salesId === value)?.salesName;
        return (
            <div className="spv-filter-bar" style={compactTop ? { marginTop: 12 } : undefined}>
                <div className="spv-filter-row">
                    <div className="spv-name-search-wrap">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spv-name-search-icon">
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                            type="text"
                            className="spv-name-search"
                            placeholder="Cari nama lead..."
                            value={nameSearch}
                            onChange={(e) => setNameSearch(e.target.value)}
                        />
                        {nameSearch ? (
                            <button type="button" className="spv-sheet-search-clear" onClick={() => setNameSearch('')}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        ) : null}
                    </div>

                    <button
                        type="button"
                        className={`spv-filter-trigger${activeLabel ? ' is-active' : ''}`}
                        onClick={() => setFilterSheet(sheetKey)}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                        </svg>
                        {activeLabel ? (
                            <>
                                <span className="spv-filter-trigger-label">{activeLabel}</span>
                                <span className="spv-filter-clear" role="button" onClick={(e) => { e.stopPropagation(); onChange('all'); }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </span>
                            </>
                        ) : null}
                    </button>
                </div>

                {filterSheet === sheetKey ? (
                    <div className="spv-panel-backdrop" onClick={closePanel}>
                        <div className="spv-panel" onClick={(e) => e.stopPropagation()}>
                            <div className="spv-panel-handle" />
                            <div className="spv-panel-header">
                                <span className="spv-panel-title">Filter berdasarkan Sales</span>
                                <button type="button" className="spv-panel-close" onClick={closePanel}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                            </div>
                            <div className="spv-panel-body">
                                <div className="spv-sheet-search-wrap">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spv-sheet-search-icon">
                                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                                    </svg>
                                    <input
                                        type="text"
                                        className="spv-sheet-search"
                                        placeholder="Cari sales..."
                                        value={filterSearch}
                                        onChange={(e) => setFilterSearch(e.target.value)}
                                        autoFocus
                                    />
                                    {filterSearch ? (
                                        <button type="button" className="spv-sheet-search-clear" onClick={() => setFilterSearch('')}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                            </svg>
                                        </button>
                                    ) : null}
                                </div>
                                <div className="spv-sheet-list">
                                    {!filterSearch ? (
                                        <button
                                            type="button"
                                            className={`spv-sheet-item${value === 'all' ? ' is-active' : ''}`}
                                            onClick={() => { onChange('all'); closePanel(); }}
                                        >
                                            <span>Semua</span>
                                            <span className="spv-sheet-count">{totalCount}</span>
                                            {value === 'all' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                                        </button>
                                    ) : null}
                                    {options
                                        .filter((o) => o.salesName.toLowerCase().includes(filterSearch.toLowerCase()))
                                        .map((o) => (
                                            <button
                                                key={o.salesId}
                                                type="button"
                                                className={`spv-sheet-item${value === o.salesId ? ' is-active' : ''}`}
                                                onClick={() => { onChange(o.salesId); closePanel(); }}
                                            >
                                                <span>{o.salesName}</span>
                                                <span className="spv-sheet-count">{o.taskCount}</span>
                                                {value === o.salesId && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                                            </button>
                                        ))
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    };

    return (
        <div className="page-container spv-page">
            <Header title="Tugas Supervisor" hasTabs />

            <div className="daily-task-tabs">
                <button
                    type="button"
                    className={`daily-task-tab ${activeSection === 'hot_leads' ? 'is-active' : ''}`}
                    onClick={() => { setActiveSection('hot_leads'); setHotSalesFilter('all'); setHotNameSearch(''); }}
                >
                    <span className="daily-task-tab-icon-wrap">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
                        </svg>
                        <span className="daily-task-tab-badge" style={leads.length === 0 ? { visibility: 'hidden' } : undefined}>{leads.length}</span>
                    </span>
                    <span className="daily-task-tab-label">Hot Leads</span>
                </button>
                <button
                    type="button"
                    className={`daily-task-tab ${activeSection === 'submitted_tasks' ? 'is-active' : ''}`}
                    onClick={() => { setActiveSection('submitted_tasks'); setSubmittedSalesFilter('all'); setSubmittedNameSearch(''); }}
                >
                    <span className="daily-task-tab-icon-wrap">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                        </svg>
                        <span className="daily-task-tab-badge" style={(submittedTotalCount + deadlineTotalCount) === 0 ? { visibility: 'hidden' } : undefined}>{submittedTotalCount + deadlineTotalCount}</span>
                    </span>
                    <span className="daily-task-tab-label">Follow Up</span>
                </button>
                <button
                    type="button"
                    className={`daily-task-tab ${activeSection === 'appointments' ? 'is-active' : ''}`}
                    onClick={() => { setActiveSection('appointments'); setAppointmentSalesFilter('all'); setAppointmentNameSearch(''); }}
                >
                    <span className="daily-task-tab-icon-wrap">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01"/></svg>
                        <span className="daily-task-tab-badge" style={activeAppointments.length === 0 ? { visibility: 'hidden' } : undefined}>{activeAppointments.length}</span>
                    </span>
                    <span className="daily-task-tab-label">Janji Temu</span>
                </button>
                <button
                    type="button"
                    className={`daily-task-tab ${activeSection === 'transactions' ? 'is-active' : ''}`}
                    onClick={() => { setActiveSection('transactions'); setTransactionSalesFilter('all'); setTransactionNameSearch(''); }}
                >
                    <span className="daily-task-tab-icon-wrap">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></svg>
                        <span className="daily-task-tab-badge" style={transactionLeads.length === 0 ? { visibility: 'hidden' } : undefined}>{transactionLeads.length}</span>
                    </span>
                    <span className="daily-task-tab-label">Transaksi</span>
                </button>
            </div>

            <div className="spv-tab-spacer" />


            {activeSection === 'hot_leads' ? (
                <section>
                    {actionError && <div className="alert alert-danger spv-section-alert">{actionError}</div>}
                    {actionSuccess && <div className="alert alert-success spv-section-alert">{actionSuccess}</div>}

                    {renderSalesFilter({
                        options: hotSalesOptions,
                        value: hotSalesFilter,
                        onChange: setHotSalesFilter,
                        totalCount: hotTotalCount,
                        sheetKey: 'hot',
                        nameSearch: hotNameSearch,
                        setNameSearch: setHotNameSearch,
                    })}

                    {/* Sub-tabs: Hot Pending & Hot Validated */}
                    <div className="spv-hot-subtabs">
                        <button
                            type="button"
                            className={`spv-hot-subtab ${hotSubTab === 'pending' ? 'is-active' : ''}`}
                            onClick={() => { setHotSubTab('pending'); setHotSalesFilter('all'); setHotNameSearch(''); }}
                        >
                            Hot Pending
                            {leads.length > 0 && <span className="spv-hot-subtab-badge">{leads.length}</span>}
                        </button>
                        <button
                            type="button"
                            className={`spv-hot-subtab ${hotSubTab === 'validated' ? 'is-active' : ''}`}
                            onClick={() => { setHotSubTab('validated'); setHotSalesFilter('all'); setHotNameSearch(''); }}
                        >
                            Hot Validated
                            {validatedLeads.length > 0 && <span className="spv-hot-subtab-badge spv-hot-subtab-badge--validated">{validatedLeads.length}</span>}
                        </button>
                    </div>

                    {hotSubTab === 'pending' ? (
                        loading ? (
                            <SpvEmpty variant="loading" title="Memuat data..." />
                        ) : leads.length === 0 ? (
                            <SpvEmpty variant="success" title="Semua lead tervalidasi" desc="Tidak ada lead HOT yang menunggu validasi saat ini." />
                        ) : filteredPendingLeads.length === 0 ? (
                            <SpvEmpty variant="search" title="Tidak ada hasil" desc="Coba ubah filter sales atau hapus pencarian nama." />
                        ) : (
                            <div className="spv-card-list spv-card-list--top">
                                {filteredPendingLeads.map((lead) => {
                                    const isBusy = actionLoading === lead.id;
                                    return (
                                        <div key={lead.id} className="spv-card spv-card-hot">
                                            <div className="spv-card-header">
                                                <span
                                                    className="spv-card-title spv-card-title-link"
                                                    onClick={() => router.push(`/leads/${lead.id}`)}
                                                >
                                                    {lead.name}
                                                </span>
                                                <span className="badge badge-hot">HOT</span>
                                            </div>

                                            <div className="spv-card-meta-grid">
                                                <span className="spv-meta-item"><IconPhone /> {lead.phone}</span>
                                                <span className="spv-meta-item"><IconUser /> {lead.assignedUserName || '-'}</span>
                                                <span className="spv-meta-item"><IconClock /> {getTimeAgo(lead.updatedAt)}</span>
                                                <span className="spv-meta-item"><IconMegaphone /> {lead.source}</span>
                                            </div>

                                            {showRejectNote[lead.id] ? (
                                                <div className="input-group" style={{ marginTop: 0 }}>
                                                    <label>Catatan Penolakan (opsional)</label>
                                                    <input
                                                        type="text"
                                                        className="input-field"
                                                        placeholder="Alasan penolakan..."
                                                        value={rejectNotes[lead.id] || ''}
                                                        onChange={(e) => setRejectNotes((prev) => ({ ...prev, [lead.id]: e.target.value }))}
                                                    />
                                                </div>
                                            ) : null}

                                            <div className="spv-card-actions">
                                                <button
                                                    type="button"
                                                    className="btn btn-sm spv-btn-validate"
                                                    disabled={isBusy}
                                                    onClick={() => void handleValidate(lead.id)}
                                                >
                                                    {isBusy ? 'Memproses...' : <><IconCheck /> Validasi</>}
                                                </button>
                                                {!showRejectNote[lead.id] ? (
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm spv-btn-reject"
                                                        disabled={isBusy}
                                                        onClick={() => toggleRejectNote(lead.id)}
                                                    >
                                                        <IconX /> Tolak
                                                    </button>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm"
                                                            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#dc2626' }}
                                                            disabled={isBusy}
                                                            onClick={() => void handleReject(lead.id)}
                                                        >
                                                            {isBusy ? 'Memproses...' : 'Konfirmasi Tolak'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn btn-ghost btn-sm"
                                                            disabled={isBusy}
                                                            onClick={() => toggleRejectNote(lead.id)}
                                                        >
                                                            Batal
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    ) : (
                        /* Hot Validated list */
                        validatedLeads.length === 0 ? (
                            <SpvEmpty variant="success" title="Belum ada Hot Validated" desc="Lead HOT yang sudah divalidasi SPV akan muncul di sini." />
                        ) : filteredValidatedLeads.length === 0 ? (
                            <SpvEmpty variant="search" title="Tidak ada hasil" desc="Coba ubah filter sales atau hapus pencarian nama." />
                        ) : (
                            <>
                                <div className="spv-hot-subtabs spv-hot-subtabs--compact" style={{ marginTop: 8 }}>
                                    <button type="button" className={`spv-hot-subtab ${hotValidatedSubTab === 'semua' ? 'is-active' : ''}`} onClick={() => setHotValidatedSubTab('semua')}>
                                        Semua ({filteredValidatedLeads.length})
                                    </button>
                                    <button type="button" className={`spv-hot-subtab ${hotValidatedSubTab === 'kurang_dari_1_bulan' ? 'is-active' : ''}`} onClick={() => setHotValidatedSubTab('kurang_dari_1_bulan')}>
                                        &lt; 1 Bulan ({validatedGroupLess.length})
                                    </button>
                                    <button type="button" className={`spv-hot-subtab ${hotValidatedSubTab === 'lebih_dari_1_bulan' ? 'is-active' : ''}`} onClick={() => setHotValidatedSubTab('lebih_dari_1_bulan')}>
                                        &gt; 1 Bulan ({validatedGroupMore.length})
                                    </button>
                                </div>

                                {((hotValidatedSubTab === 'kurang_dari_1_bulan' && validatedGroupLess.length === 0) ||
                                  (hotValidatedSubTab === 'lebih_dari_1_bulan' && validatedGroupMore.length === 0)) ? (
                                    <SpvEmpty variant="search" title="Tidak ada lead HOT" desc="Tidak ada lead HOT untuk kategori ini." />
                                ) : (
                                    <div className="spv-card-list spv-card-list--top">
                                        {(hotValidatedSubTab === 'semua' || hotValidatedSubTab === 'kurang_dari_1_bulan') && validatedGroupLess.length > 0 && (
                                            <>
                                                {hotValidatedSubTab === 'semua' && <div className="spv-group-title">&lt; 1 Bulan</div>}
                                                {validatedGroupLess.map((lead) => (
                                                    <div key={lead.id} className="spv-card spv-card-hot">
                                                        <div className="spv-card-header">
                                                            <span className="spv-card-title spv-card-title-link" onClick={() => router.push(`/leads/${lead.id}`)}>{lead.name}</span>
                                                            <span className="badge badge-hot" style={{ background: 'rgba(16,185,129,0.15)', color: '#059669', borderColor: 'rgba(16,185,129,0.4)' }}>HOT ✓</span>
                                                        </div>
                                                        <div className="spv-card-meta-grid">
                                                            <span className="spv-meta-item"><IconPhone /> {lead.phone}</span>
                                                            <span className="spv-meta-item"><IconUser /> {lead.assignedUserName || lead.assignedTo || '-'}</span>
                                                            <span className="spv-meta-item"><IconClock /> {getTimeAgo(lead.updatedAt)}</span>
                                                            <span className="spv-meta-item"><IconMegaphone /> {lead.source}</span>
                                                        </div>
                                                        <div className="spv-card-actions spv-card-actions-stack">
                                                            <a href={toWaLink(lead.phone)} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp" style={{ width: '100%', height: '40px', padding: '0 12px', fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                                                                Chat WhatsApp
                                                            </a>
                                                            {renderTransactionStatusControls(lead, HOT_TRANSACTION_STATUS_OPTIONS)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </>
                                        )}
                                        {(hotValidatedSubTab === 'semua' || hotValidatedSubTab === 'lebih_dari_1_bulan') && validatedGroupMore.length > 0 && (
                                            <>
                                                {hotValidatedSubTab === 'semua' && <div className="spv-group-title">&gt; 1 Bulan</div>}
                                                {validatedGroupMore.map((lead) => (
                                                    <div key={lead.id} className="spv-card spv-card-hot">
                                                        <div className="spv-card-header">
                                                            <span className="spv-card-title spv-card-title-link" onClick={() => router.push(`/leads/${lead.id}`)}>{lead.name}</span>
                                                            <span className="badge badge-hot" style={{ background: 'rgba(16,185,129,0.15)', color: '#059669', borderColor: 'rgba(16,185,129,0.4)' }}>HOT ✓</span>
                                                        </div>
                                                        <div className="spv-card-meta-grid">
                                                            <span className="spv-meta-item"><IconPhone /> {lead.phone}</span>
                                                            <span className="spv-meta-item"><IconUser /> {lead.assignedUserName || lead.assignedTo || '-'}</span>
                                                            <span className="spv-meta-item"><IconClock /> {getTimeAgo(lead.updatedAt)}</span>
                                                            <span className="spv-meta-item"><IconMegaphone /> {lead.source}</span>
                                                        </div>
                                                        <div className="spv-card-actions spv-card-actions-stack">
                                                            <a href={toWaLink(lead.phone)} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp" style={{ width: '100%', height: '40px', padding: '0 12px', fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                                                                Chat WhatsApp
                                                            </a>
                                                            {renderTransactionStatusControls(lead, HOT_TRANSACTION_STATUS_OPTIONS)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                )}
                            </>
                        )
                    )}
                </section>
            ) : null}

            {activeSection === 'submitted_tasks' ? (
                <section>
                    {renderSalesFilter({
                        options: followUpSubTab === 'deadlines' ? deadlineSalesOptions : submittedSalesOptions,
                        value: followUpSubTab === 'deadlines' ? deadlineSalesFilter : submittedSalesFilter,
                        onChange: followUpSubTab === 'deadlines' ? setDeadlineSalesFilter : setSubmittedSalesFilter,
                        totalCount: followUpSubTab === 'deadlines' ? deadlineTotalCount : submittedTotalCount,
                        sheetKey: 'submitted',
                        nameSearch: submittedNameSearch,
                        setNameSearch: setSubmittedNameSearch,
                    })}

                    <div className="spv-hot-subtabs spv-hot-subtabs--compact">
                        {[
                            ['new_leads', 'New Leads', followUpTabCounts.new_leads],
                            ['follow_up_1', 'Follow Up 1', followUpTabCounts.follow_up_1],
                            ['follow_up_2', 'Follow Up 2', followUpTabCounts.follow_up_2],
                            ['follow_up_3', 'Follow Up 3', followUpTabCounts.follow_up_3],
                            ['deadlines', 'Deadlines', followUpTabCounts.deadlines],
                        ].map(([key, label, count]) => (
                            <button
                                key={key}
                                type="button"
                                className={`spv-hot-subtab ${followUpSubTab === key ? 'is-active' : ''}`}
                                onClick={() => {
                                    setFollowUpSubTab(key);
                                    setSubmittedSalesFilter('all');
                                    setDeadlineSalesFilter('all');
                                    setSubmittedNameSearch('');
                                }}
                            >
                                {label}
                                {count > 0 && <span className="spv-hot-subtab-badge">{count}</span>}
                            </button>
                        ))}
                    </div>

                    {loading ? (
                        <SpvEmpty variant="loading" title="Memuat Follow Up..." />
                    ) : (followUpSubTab === 'deadlines' ? deadlineTaskGroups.length === 0 : submittedTaskGroups.length === 0) ? (
                        <SpvEmpty variant="clipboard" title="Belum ada data" desc="Task Follow Up sales akan muncul di sini." />
                    ) : visibleFollowUpGroups.length === 0 ? (
                        <SpvEmpty variant="search" title="Tidak ada hasil" desc="Coba ubah filter sales atau hapus pencarian nama." />
                    ) : (
                        <div className="spv-card-list">
                            {visibleFollowUpGroups
                                .map((group) => {
                                    const tasks = group.tasks || [];
                                    if (tasks.length === 0) return null;
                                    return (
                                        <div key={group.salesId} className="spv-card spv-card-submitted spv-card-submitted-group">
                                            <div className="spv-card-header">
                                                <span className="spv-card-title">{group.salesName}</span>
                                                <span className="badge badge-info">{tasks.length} task</span>
                                            </div>

                                            <div className="spv-tasks-container">
                                                {tasks.map((task) => (
                                                    <div
                                                        key={task.id}
                                                        className={`spv-task-sub-item ${!task.screenshotUrl ? 'spv-task-sub-noimg' : ''}`}
                                                    >
                                                        <div>
                                                            <div
                                                                className="spv-card-title spv-card-title-link"
                                                                style={{ fontSize: '0.875rem', marginBottom: 6 }}
                                                                onClick={() => router.push(`/leads/${task.leadId}`)}
                                                            >
                                                                {task.leadName}
                                                            </div>
                                                            <div className="spv-card-meta-grid" style={{ borderTop: 'none', borderBottom: 'none', paddingTop: 0, paddingBottom: 0, gap: '4px 12px' }}>
                                                                <span className="spv-meta-item"><IconPhone /> {task.leadPhone}</span>
                                                                <span className="spv-meta-item"><IconMegaphone /> {task.leadSource}</span>
                                                                <span className="spv-meta-item"><IconClock /> {getTimeAgo(task.completedAt)}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                                                                <span className="badge badge-info">{task.label}</span>
                                                                {task.submittedSalesStatus ? (
                                                                    <span className="badge badge-warm">{task.submittedSalesStatus.toUpperCase()}</span>
                                                                ) : null}
                                                            </div>
                                                        </div>

                                                        {task.screenshotUrl ? (
                                                            <img
                                                                src={task.screenshotUrl}
                                                                alt={`${task.label} proof`}
                                                                className="spv-task-proof-img"
                                                                onClick={() => setLightboxImage({ url: task.screenshotUrl, caption: `${group.salesName} — ${task.label}` })}
                                                            />
                                                        ) : null}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </section>
            ) : null}

            {activeSection === 'appointments' ? (
                <section>
                    {renderSalesFilter({
                        options: appointmentSalesOptions,
                        value: appointmentSalesFilter,
                        onChange: setAppointmentSalesFilter,
                        totalCount: activeAppointments.length,
                        sheetKey: 'appointment',
                        nameSearch: appointmentNameSearch,
                        setNameSearch: setAppointmentNameSearch,
                    })}

                    {loading ? (
                        <SpvEmpty variant="loading" title="Memuat janji temu..." />
                    ) : activeAppointments.length === 0 ? (
                        <SpvEmpty variant="success" title="Tidak ada janji temu aktif" desc="Janji temu Mau Survey dari sales akan muncul di sini." />
                    ) : visibleAppointments.length === 0 ? (
                        <SpvEmpty variant="search" title="Tidak ada hasil" desc="Coba ubah filter sales atau hapus pencarian nama." />
                    ) : (
                        <div className="spv-card-list">
                            {visibleAppointments.map((appointment) => (
                                <div key={appointment.id} className="spv-card spv-card-submitted">
                                    <div className="spv-card-header">
                                        <span
                                            className="spv-card-title spv-card-title-link"
                                            onClick={() => router.push(`/leads/${appointment.leadId}`)}
                                        >
                                            {appointment.leadName}
                                        </span>
                                        <span className="badge badge-info">Mau Survey</span>
                                    </div>
                                    <div className="spv-card-meta-grid">
                                        <span className="spv-meta-item"><IconPhone /> {appointment.leadPhone}</span>
                                        <span className="spv-meta-item"><IconUser /> {appointment.salesName || '-'}</span>
                                        <span className="spv-meta-item"><IconClock /> {formatDateTime(`${appointment.date}T${appointment.time || '00:00'}`)}</span>
                                        <span className="spv-meta-item"><IconMegaphone /> {appointment.leadSource}</span>
                                    </div>
                                    {appointment.location ? <div className="spv-meta-item" style={{ marginTop: 8 }}>{appointment.location}</div> : null}
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            ) : null}

            {activeSection === 'transactions' ? (
                <section>
                    {renderSalesFilter({
                        options: transactionSalesOptions,
                        value: transactionSalesFilter,
                        onChange: setTransactionSalesFilter,
                        totalCount: transactionLeads.length,
                        sheetKey: 'transaction',
                        nameSearch: transactionNameSearch,
                        setNameSearch: setTransactionNameSearch,
                    })}

                    <div className="spv-hot-subtabs spv-hot-subtabs--compact">
                        <button
                            type="button"
                            className={`spv-hot-subtab ${transactionSubTab === 'reserve' ? 'is-active' : ''}`}
                            onClick={() => { setTransactionSubTab('reserve'); setTransactionNameSearch(''); }}
                        >
                            Reserve
                            {reserveCount > 0 && <span className="spv-hot-subtab-badge">{reserveCount}</span>}
                        </button>
                        <button
                            type="button"
                            className={`spv-hot-subtab ${transactionSubTab === 'full_book' ? 'is-active' : ''}`}
                            onClick={() => { setTransactionSubTab('full_book'); setTransactionNameSearch(''); }}
                        >
                            Full Book
                            {fullBookCount > 0 && <span className="spv-hot-subtab-badge">{fullBookCount}</span>}
                        </button>
                    </div>

                    {visibleTransactionLeads.length === 0 ? (
                        <SpvEmpty variant="success" title="Tidak ada transaksi" desc="Lead Reserve dan Full Book tim akan muncul di sini." />
                    ) : (
                        <div className="spv-card-list">
                            {visibleTransactionLeads.map((lead) => {
                                const status = getLeadResultStatus(lead);
                                const salesName = managedSales.find((sales) => sales.id === lead.assignedTo)?.name || lead.assignedUserName || '-';
                                return (
                                    <div key={lead.id} className="spv-card spv-card-hot">
                                        <div className="spv-card-header">
                                            <span
                                                className="spv-card-title spv-card-title-link"
                                                onClick={() => router.push(`/leads/${lead.id}`)}
                                            >
                                                {lead.name}
                                            </span>
                                            <span className={`badge ${status === 'reserve' ? 'badge-warm' : 'badge-info'}`}>{getResultStatusLabel(status)}</span>
                                        </div>
                                        <div className="spv-card-meta-grid">
                                            <span className="spv-meta-item"><IconPhone /> {lead.phone}</span>
                                            <span className="spv-meta-item"><IconUser /> {salesName}</span>
                                            <span className="spv-meta-item"><IconClock /> {getTimeAgo(lead.resultStatusUpdatedAt || lead.updatedAt)}</span>
                                            <span className="spv-meta-item"><IconMegaphone /> {lead.source}</span>
                                        </div>
                                        <div className="spv-card-actions spv-card-actions-stack">
                                            <a
                                                href={toWaLink(lead.phone)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn btn-whatsapp"
                                                style={{ width: '100%', height: '40px', padding: '0 12px', fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                                                Chat WhatsApp
                                            </a>
                                            <button
                                                type="button"
                                                className="spv-view-detail-btn"
                                                onClick={() => router.push(`/leads/${lead.id}`)}
                                            >
                                                Lihat Detail Lead
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            ) : null}

            {activeSection === 'cold_leads' ? (
                <section>
                    {renderSalesFilter({
                        options: deadlineSalesOptions,
                        value: deadlineSalesFilter,
                        onChange: setDeadlineSalesFilter,
                        totalCount: deadlineTotalCount,
                        sheetKey: 'cold',
                        nameSearch: coldNameSearch,
                        setNameSearch: setColdNameSearch,
                    })}

                    {loading ? (
                        <SpvEmpty variant="loading" title="Memuat Cold Leads..." />
                    ) : deadlineTaskGroups.length === 0 ? (
                        <SpvEmpty variant="snow" title="Tidak ada Cold Leads" desc="Lead muncul di sini saat hari ke-14 belum di-follow up oleh sales." />
                    ) : visibleDeadlineTaskGroups.length === 0 ? (
                        <SpvEmpty variant="search" title="Tidak ada hasil" desc="Coba ubah filter sales atau hapus pencarian nama." />
                    ) : (
                        <div className="spv-card-list">
                            {visibleDeadlineTaskGroups
                                .map((group) => {
                                    const tasks = coldNameSearch
                                        ? group.tasks.filter((t) => t.leadName?.toLowerCase().includes(coldNameSearch.toLowerCase()))
                                        : group.tasks;
                                    if (tasks.length === 0) return null;
                                    return (
                                        <div key={group.salesId} className="spv-card spv-card-cold">
                                            <div className="spv-card-header">
                                                <span className="spv-card-title">{group.salesName}</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span className="badge badge-danger">{tasks.length} leads</span>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm spv-nudge-btn"
                                                        onClick={() => handleNudgeSales(
                                                            group.salesId,
                                                            group.salesName,
                                                            `${tasks.length} lead`,
                                                            ''
                                                        )}
                                                    >
                                                        <IconNudge /> Nudge
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="spv-tasks-container">
                                                {tasks.map((task) => (
                                                    <div key={task.id} className="spv-task-sub-item spv-task-sub-noimg">
                                                        <div>
                                                            <div
                                                                className="spv-card-title spv-card-title-link"
                                                                style={{ fontSize: '0.875rem', marginBottom: 6 }}
                                                                onClick={() => router.push(`/leads/${task.leadId}`)}
                                                            >
                                                                {task.leadName}
                                                            </div>
                                                            <div className="spv-card-meta-grid" style={{ borderTop: 'none', borderBottom: 'none', paddingTop: 0, paddingBottom: 0, gap: '4px 12px' }}>
                                                                <span className="spv-meta-item"><IconPhone /> {task.leadPhone}</span>
                                                                <span className="spv-meta-item"><IconMegaphone /> {task.leadSource}</span>
                                                                <span className="spv-meta-item"><IconClock /> Lead age: {getTimeAgo(task.createdAt)}</span>
                                                                <span className="spv-meta-item"><IconUser /> Deadline: {formatDateTime(task.dueAt)}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                                                                <span className="badge badge-danger">Deadline Leads</span>
                                                                {task.salesStatus ? (
                                                                    <span className={`badge ${task.salesStatus === 'hot' ? 'badge-hot' : 'badge-warm'}`}>
                                                                        {getSalesStatusLabel(task.salesStatus)}
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </section>
            ) : null}

            {lightboxImage ? (
                <div className="lightbox-overlay" onClick={() => setLightboxImage(null)}>
                    <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            className="lightbox-close"
                            onClick={() => setLightboxImage(null)}
                            aria-label="Tutup"
                        >
                            ✕
                        </button>
                        <img src={lightboxImage.url} alt={lightboxImage.caption} className="lightbox-img" />
                        {lightboxImage.caption ? (
                            <div className="lightbox-caption">{lightboxImage.caption}</div>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
