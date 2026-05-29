'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import {
    APPOINTMENT_TAGS,
    CUSTOMER_PIPELINE_STEPS,
    DAILY_TASK_FOLLOWUP_MILESTONE_DAYS,
    RESULT_STATUSES,
    SALES_STATUSES,
    SALES_STATUS_COLD_OPEN_DAYS,
    getAppointmentTagLabel,
    getFlowStatusLabel,
    getRejectedReasonLabel,
    getResultStatusLabel,
    getSalesStatusLabel,
    getStatusBadgeClass,
    getTimeAgo,
    formatDate,
    toWaLink,
    isCancelResultStatus,
} from '../constants/crm';
import { INDONESIA_CITIES } from '../constants/indonesiaCities';
import Header from '../components/Header';
import UserAvatar from '../components/UserAvatar';
import Button from '../components/Button';
import DatePicker from '../components/DatePicker';
import SelectFilter from '../components/SelectFilter';
import { apiRequest } from '../lib/api';
import { useToast } from '../context/ToastContext';
import './LeadDetailPage.css';

function formatExactDateTime(value) {
    if (!value) {
        return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '-';
    }

    return date.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function isOlderThanDays(value, days) {
    if (!value) {
        return false;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return false;
    }

    return Date.now() - date.getTime() > days * 24 * 60 * 60 * 1000;
}

function addDays(value, days) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function isAgentSource(value) {
    return String(value || '').trim().toLowerCase() === 'agent';
}

function normalizeResultStatusForForm(value) {
    return value === 'cancel' ? 'cancel_transaksi' : value || '';
}

function buildCustomerPipelineRows(lead) {
    const sourceRows = Array.isArray(lead?.customerPipeline) ? lead.customerPipeline : [];
    const mapped = new Map(sourceRows.map((item) => [Number(item.stepNo), item]));

    return CUSTOMER_PIPELINE_STEPS.map((step) => {
        const source = mapped.get(step.stepNo) || null;
        const eligibleAt =
            source?.eligibleAt ||
            addDays(lead?.acceptedAt, DAILY_TASK_FOLLOWUP_MILESTONE_DAYS[step.stepNo - 1]) ||
            null;
        const isUpcoming =
            eligibleAt &&
            new Date(eligibleAt).getTime() > Date.now() &&
            !source;

        return {
            ...step,
            ...(source || {}),
            status: source?.status || (isUpcoming ? 'upcoming' : 'pending'),
            eligibleAt,
            dueAt: source?.dueAt || null,
            completedAt: source?.completedAt || null,
            screenshotUrl: source?.screenshotUrl || null,
        };
    });
}

const sourceDomicileSchema = z.object({
    source: z.string().min(1, 'Sumber lead wajib dipilih.'),
    agentOfficeName: z.string().optional(),
    domicileCity: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
    if (isAgentSource(data.source)) {
        if (!data.agentOfficeName || !data.agentOfficeName.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Nama kantor wajib diisi.',
                path: ['agentOfficeName'],
            });
        }
    }
});

const transactionSchema = z.object({
    resultStatus: z.string().min(1, 'Status transaksi wajib dipilih.'),
    unitName: z.string().optional(),
    unitDetail: z.string().optional(),
    paymentMethod: z.string().optional(),
    rejectedReason: z.string().optional(),
    rejectedNote: z.string().optional(),
}).superRefine((data, ctx) => {
    if (data.resultStatus === 'akad') {
        if (!data.unitName || !data.unitName.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Nama unit wajib diisi.',
                path: ['unitName'],
            });
        }
        if (!data.unitDetail || !data.unitDetail.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Detail unit wajib diisi.',
                path: ['unitDetail'],
            });
        }
        if (!data.paymentMethod || !data.paymentMethod.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Cara bayar wajib diisi.',
                path: ['paymentMethod'],
            });
        }
    } else if (isCancelResultStatus(data.resultStatus)) {
        if (!data.rejectedReason || !data.rejectedReason.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Alasan cancel wajib dipilih.',
                path: ['rejectedReason'],
            });
        }
    }
});

export default function LeadDetailPage({ leadId }) {
    const { user, isAdmin } = useAuth();
    const {
        getLeadById,
        loadLeadById,
        updateLead,
        deleteLead,
        addAppointment,
        updateAppointment,
        cancelAppointment,
        getSalesUsers,
        getLeadSources,
    } = useLeads();
    const router = useRouter();
    const toast = useToast();

    const [showAppt, setShowAppt] = useState(false);
    const [showNote, setShowNote] = useState(false);
    const [apptStatusFilter, setApptStatusFilter] = useState('all');

    const [editingAppointment, setEditingAppointment] = useState(null);
    const [note, setNote] = useState('');
    const [appt, setAppt] = useState({
        date: '',
        time: '',
        location: '',
        notes: '',
        status: 'mau_survey',
    });
    const [interestUnitId, setInterestUnitId] = useState('');
    const [requestError, setRequestError] = useState('');
    const [nameError, setNameError] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [deleteLeadState, setDeleteLeadState] = useState({
        open: false,
        passwordConfirmation: '',
        submitting: false,
        error: '',
    });
    const [unitOptions, setUnitOptions] = useState([]);
    const [unitsLoading, setUnitsLoading] = useState(false);
    const [cancelReasons, setCancelReasons] = useState([]);
    const [cancelReasonsLoading, setCancelReasonsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('action');
    const [editSales, setEditSales] = useState(false);
    const [tempSales, setTempSales] = useState('');
    const [editSourceDomicile, setEditSourceDomicile] = useState(false);
    const [showInlineAppt, setShowInlineAppt] = useState(false);
    const [showProspectStatusSheet, setShowProspectStatusSheet] = useState(false);
    const [editName, setEditName] = useState(false);
    const [tempName, setTempName] = useState('');

    const {
        register: registerSource,
        handleSubmit: handleSubmitSource,
        control: controlSource,
        formState: { errors: sourceErrors },
        reset: resetSource,
        watch: watchSource,
    } = useForm({
        resolver: zodResolver(sourceDomicileSchema),
        defaultValues: {
            source: '',
            agentOfficeName: '',
            domicileCity: '',
        }
    });

    const {
        register: registerResult,
        handleSubmit: handleSubmitResult,
        control: controlResult,
        formState: { errors: resultErrors },
        reset: resetResult,
        watch: watchResult,
    } = useForm({
        resolver: zodResolver(transactionSchema),
        defaultValues: {
            resultStatus: '',
            unitName: '',
            unitDetail: '',
            paymentMethod: '',
            rejectedReason: '',
            rejectedNote: '',
        }
    });

    const watchedSource = watchSource('source');
    const watchedResultStatus = watchResult('resultStatus');

    const lead = getLeadById(leadId);
    const salesUsers = getSalesUsers();
    const leadSources = getLeadSources();
    const availableLeadSources = useMemo(
        () => {
            const values = new Set(
                Array.isArray(leadSources)
                    ? leadSources.map((item) => item?.value || item).filter(Boolean)
                    : []
            );
            if (lead?.source) {
                values.add(lead.source);
            }
            return Array.from(values);
        },
        [lead?.source, leadSources]
    );

    const getSalesNameById = (salesId) => salesUsers.find((item) => item.id === salesId)?.name || 'Unassigned';
    const getCancelReasonLabel = (code) => {
        const matched = cancelReasons.find((item) => item.code === code);
        return matched?.label || getRejectedReasonLabel(code);
    };

    useEffect(() => {
        const theme = document.documentElement.getAttribute('data-theme');
        if (theme === 'light') {
            document.body.style.backgroundColor = '#FFFFFF';
        }
        return () => {
            document.body.style.backgroundColor = '';
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        const loadDetail = async () => {
            if (!leadId) {
                return;
            }

            try {
                if (!cancelled) {
                    setRequestError('');
                }
                await loadLeadById(leadId);
            } catch (err) {
                if (!cancelled) {
                    setRequestError(err instanceof Error ? err.message : 'Failed loading lead');
                }
            }
        };

        void loadDetail();

        return () => {
            cancelled = true;
        };
    }, [leadId, loadLeadById]);

    useEffect(() => {
        if (!lead) {
            return;
        }

        setInterestUnitId(lead.interestUnitId || '');
        resetSource({
            source: lead.source || availableLeadSources[0] || '',
            agentOfficeName: lead.agentOfficeName || '',
            domicileCity: lead.domicileCity || '',
        });
        resetResult({
            resultStatus: normalizeResultStatusForForm(lead.resultStatus),
            unitName: lead.unitName || '',
            unitDetail: lead.unitDetail || '',
            paymentMethod: lead.paymentMethod || '',
            rejectedReason: lead.rejectedReason || '',
            rejectedNote: lead.rejectedNote || '',
        });
    }, [availableLeadSources, lead, resetSource, resetResult]);

    useEffect(() => {
        let cancelled = false;

        const loadUnits = async () => {
            if (!user) {
                return;
            }

            setUnitsLoading(true);
            try {
                const rows = await apiRequest('/api/units', { user });
                if (!cancelled) {
                    setUnitOptions(Array.isArray(rows) ? rows : []);
                }
            } catch {
                if (!cancelled) {
                    setUnitOptions([]);
                }
            } finally {
                if (!cancelled) {
                    setUnitsLoading(false);
                }
            }
        };

        void loadUnits();

        return () => {
            cancelled = true;
        };
    }, [user]);

    useEffect(() => {
        let cancelled = false;

        const loadCancelReasons = async () => {
            if (!user) {
                return;
            }

            setCancelReasonsLoading(true);
            try {
                const rows = await apiRequest('/api/cancel-reasons?onlyActive=true', { user });
                if (!cancelled) {
                    setCancelReasons(Array.isArray(rows) ? rows : []);
                }
            } catch {
                if (!cancelled) {
                    setCancelReasons([]);
                }
            } finally {
                if (!cancelled) {
                    setCancelReasonsLoading(false);
                }
            }
        };

        void loadCancelReasons();

        return () => {
            cancelled = true;
        };
    }, [user]);

    const effectiveFlowStatus =
        lead?.flowStatus === 'open' && lead?.assignedTo ? 'assigned' : lead?.flowStatus;

    const canEditLead = useMemo(() => {
        if (user?.role !== 'sales') {
            return false;
        }

        const sameByEmail =
            typeof lead?.assignedUser?.email === 'string' &&
            lead.assignedUser.email === user?.email;
        const sameById = lead?.assignedTo === user?.id;
        return Boolean(sameByEmail || sameById);
    }, [lead?.assignedTo, lead?.assignedUser?.email, user?.email, user?.id, user?.role]);

    const canAdminAssignOpenLead = useMemo(() => {
        return Boolean(isAdmin && !lead?.assignedTo);
    }, [isAdmin, lead?.assignedTo]);
    const canDeleteLead = user?.role === 'client_admin' || user?.role === 'root_admin';

    const isAcceptedLead = effectiveFlowStatus === 'accepted';
    const needsNewLeadTaskAcceptance = canEditLead && effectiveFlowStatus === 'assigned';
    const isLockedByAkad = lead?.resultStatus === 'akad';
    const appointmentTag = lead?.appointmentTag || 'none';
    const canUpdateLayer2 = isAcceptedLead && !isLockedByAkad;
    const canEditProspectStatus = (isAdmin || (canEditLead && isAcceptedLead)) && !isLockedByAkad;
    const canEditInterestUnit = (isAdmin || (canEditLead && isAcceptedLead)) && !isLockedByAkad;
    const canUpdateResult = canEditLead && !isLockedByAkad;
    const leadAllowsDelayedStatuses = isOlderThanDays(lead?.createdAt, SALES_STATUS_COLD_OPEN_DAYS);
    const visibleSalesStatuses = SALES_STATUSES.filter((item) => (
        leadAllowsDelayedStatuses ||
        !['cold', 'no_response'].includes(item.key) ||
        item.key === lead?.salesStatus
    ));
    const customerPipelineRows = useMemo(() => buildCustomerPipelineRows(lead), [lead]);

    const runLeadUpdate = async (payload, successMessage = 'Update berhasil disimpan.') => {
        try {
            await updateLead(lead.id, payload);
            toast.success(successMessage);
            return true;
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed updating lead');
            return false;
        }
    };

    const runAddAppointment = async (payload) => {
        try {
            if (editingAppointment?.id) {
                await updateAppointment(editingAppointment.id, payload);
            } else {
                await addAppointment(lead.id, payload);
                setShowInlineAppt(false);
            }
            setAppt({ date: '', time: '', location: '', notes: '', status: 'mau_survey' });
            setEditingAppointment(null);
            setShowAppt(false);
            toast.success(
                editingAppointment?.id
                    ? 'Janji temu berhasil diperbarui.'
                    : 'Janji temu berhasil dibuat.'
            );
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed saving appointment');
        }
    };

    const handleRefresh = async () => {
        if (!leadId) {
            return;
        }
        setRefreshing(true);
        try {
            setRequestError('');
            await loadLeadById(leadId);
        } catch (err) {
            setRequestError(err instanceof Error ? err.message : 'Failed loading lead');
        } finally {
            setRefreshing(false);
        }
    };

    if (!lead) {
        return (
            <div className="page-container dash-page leads-page">
                <Header title="Detail Lead" showBack rightAction={(
                    <button className="btn btn-sm btn-secondary btn-icon-refresh" onClick={() => void handleRefresh()} disabled={refreshing} title="Refresh">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                    </button>
                )} />
                <div className="lc-empty">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                    <span className="lc-empty-title">Lead tidak ditemukan</span>
                </div>
            </div>
        );
    }

    const canEditProfile = canEditLead || isAdmin;

    const handleSaveSales = async () => {
        if (!isAdmin) return;
        const nextSales = tempSales || null;
        if (nextSales === lead.assignedTo) {
            setEditSales(false);
            return;
        }
        const message = nextSales
            ? `Lead berhasil di-assign ke ${getSalesNameById(nextSales)}.`
            : 'Lead dikembalikan ke Open (tanpa sales).';
        const ok = await runLeadUpdate({
            assignedTo: nextSales,
            activityNote: nextSales
                ? `Lead diassign ke ${getSalesNameById(nextSales)}`
                : 'Lead diassign kembali ke Open (tanpa sales)'
        }, message);
        if (ok) {
            setEditSales(false);
        }
    };

    const handleSaveSourceDomicile = async (data) => {
        if (!canEditProfile) return;
        const payload = {
            source: data.source,
            agentOfficeName: isAgentSource(data.source) ? data.agentOfficeName?.trim() || null : null,
            domicileCity: data.domicileCity || null,
            activityNote: 'Profile info diperbarui',
        };
        const ok = await runLeadUpdate(payload, 'Info berhasil disimpan.');
        if (ok) {
            setEditSourceDomicile(false);
        }
    };

    const handleInterestUnitChange = async (unitId) => {
        if (!canEditInterestUnit) return;
        setInterestUnitId(unitId);
        await runLeadUpdate({
            interestUnitId: unitId || null,
            activityNote: 'Interest unit diperbarui',
        }, 'Unit berhasil disimpan.');
    };

    const handleSaveName = async () => {
        setNameError('');
        if (!tempName.trim()) {
            setNameError('Nama lead tidak boleh kosong.');
            return;
        }
        if (tempName.trim() === lead.name) {
            setEditName(false);
            return;
        }
        const ok = await runLeadUpdate({
            name: tempName.trim(),
            activityNote: `Nama lead diubah menjadi ${tempName.trim()}`
        }, 'Nama lead berhasil disimpan.');
        if (ok) {
            setEditName(false);
        }
    };

    const handleUpdateProspectStatus = async (statusKey) => {
        if (!canEditProspectStatus) return;
        const ok = await runLeadUpdate({
            salesStatus: statusKey,
            activityNote: `Prospect status diperbarui ke ${getSalesStatusLabel(statusKey)}`,
        }, `Prospect status berhasil diubah.`);
        if (ok) {
            setShowProspectStatusSheet(false);
        }
    };

    const handleSaveResult = async (data) => {
        if (!canEditLead) {
            return;
        }

        if (data.resultStatus === 'akad') {
            await runLeadUpdate({
                resultStatus: 'akad',
                unitName: data.unitName,
                unitDetail: data.unitDetail,
                paymentMethod: data.paymentMethod,
            }, 'Result status berhasil diubah ke Akad.');
            return;
        }

        if (isCancelResultStatus(data.resultStatus)) {
            await runLeadUpdate({
                resultStatus: data.resultStatus,
                rejectedReason: data.rejectedReason,
                rejectedNote: data.rejectedNote?.trim() || null,
            }, `Result status berhasil diubah ke ${getResultStatusLabel(data.resultStatus)}. Status L2 otomatis menjadi Skip.`);
            return;
        }

        await runLeadUpdate({
            resultStatus: data.resultStatus,
        }, `Result status berhasil diubah ke ${getResultStatusLabel(data.resultStatus)}.`);
    };

    const handleAddNote = async (event) => {
        event.preventDefault();
        if (!note.trim()) {
            return;
        }
        await runLeadUpdate({ manualNote: note.trim() }, 'Catatan berhasil disimpan.');
        setNote('');
        setShowNote(false);
    };

    const handleAddAppt = async (event) => {
        event.preventDefault();
        if (!appt.date || !appt.time || !appt.location) {
            return;
        }
        await runAddAppointment(appt);
    };

    const getNowDateStr = () => {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const getNowTimeStr = () => {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        return `${h}:${min}`;
    };

    const formatApptDate = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr + 'T00:00:00');
        if (Number.isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    };

    const openCreateAppointment = () => {
        setEditingAppointment(null);
        setAppt({
            date: getNowDateStr(),
            time: getNowTimeStr(),
            location: '',
            notes: '',
            status: 'mau_survey',
        });
        setShowAppt(true);
    };

    const openEditAppointment = (item) => {
        setEditingAppointment(item);
        setAppt({
            date: item.date || '',
            time: item.time || '',
            location: item.location || '',
            notes: item.notes || '',
            status: item.status || 'mau_survey',
        });
        setShowAppt(true);
    };

    const handleQuickSudahSurvey = async (item) => {
        if (!item?.id) return;
        try {
            await updateAppointment(item.id, { status: 'sudah_survey' });
            toast.success('Status diubah ke Sudah Survey.');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Gagal update status');
        }
    };

    const handleQuickReschedule = (item) => {
        openEditAppointment(item);
    };

    const handleCancelAppointment = async (item) => {
        if (!item?.id) {
            return;
        }

        const confirmed = window.confirm('Tandai appointment ini sebagai dibatalkan?');
        if (!confirmed) {
            return;
        }

        try {
            await cancelAppointment(item.id, {
                notes: item.notes || null,
            });
            toast.success('Janji temu berhasil dibatalkan.');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed cancelling appointment');
        }
    };

    const handleDeleteLead = async () => {
        if (!lead?.id || !String(deleteLeadState.passwordConfirmation || '').trim()) {
            setDeleteLeadState((prev) => ({
                ...prev,
                error: 'Password admin wajib diisi untuk menghapus lead.',
            }));
            return;
        }

        try {
            setDeleteLeadState((prev) => ({
                ...prev,
                submitting: true,
                error: '',
            }));
            await deleteLead(lead.id, deleteLeadState.passwordConfirmation);
            toast.success('Lead berhasil dihapus.');
            router.push('/leads');
        } catch (err) {
            setDeleteLeadState((prev) => ({
                ...prev,
                submitting: false,
                error: err instanceof Error
                    ? err.message === 'ADMIN_PASSWORD_INVALID'
                        ? 'Password admin tidak valid.'
                        : err.message === 'ADMIN_PASSWORD_REQUIRED'
                            ? 'Password admin wajib diisi.'
                            : err.message
                    : 'Gagal menghapus lead',
            }));
        }
    };

    const rightActions = (
        <div style={{ display: 'flex', gap: '8px' }}>
            {canDeleteLead ? (
                <button
                    className="btn btn-sm btn-danger btn-icon-only ldp-header-btn"
                    onClick={() => setDeleteLeadState({ open: true, passwordConfirmation: '', submitting: false, error: '' })}
                    title="Hapus Lead"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                </button>
            ) : null}
            <button
                className="btn btn-sm btn-secondary btn-icon-only ldp-header-btn"
                onClick={() => void handleRefresh()}
                disabled={refreshing}
                title="Refresh"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={refreshing ? { animation: 'btnSpin 0.7s linear infinite' } : {}}>
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
            </button>
        </div>
    );

    return (
        <div className="page-container dash-page leads-page">
            <Header
                title="Detail Lead"
                showBack
                rightAction={rightActions}
            />

            <div className="ldp-mobile-top">
                <button className="ldp-mobile-back" onClick={() => router.back()} aria-label="Kembali">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                </button>
                <span className="ldp-mobile-title">Detail Lead</span>
                {rightActions}
            </div>

            {/* ── Profile card ─────────────────────────────────── */}
            <div className="ldp-profile-card">
                <div className="ldp-profile-head">
                    <UserAvatar name={lead.name} size="md" shape="circle" />
                    <div className="ldp-profile-identity">
                        {editName ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div className="ldp-edit-name-wrap" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <input
                                        autoFocus
                                        type="text"
                                        className="input-field ldp-name-edit-input"
                                        style={{ width: '100%', maxWidth: '240px', padding: '6px 12px', fontSize: '1rem', fontWeight: 600, height: '38px' }}
                                        value={tempName}
                                        onChange={(e) => setTempName(e.target.value)}
                                        placeholder="Nama Leads"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                void handleSaveName();
                                            } else if (e.key === 'Escape') {
                                                setEditName(false);
                                            }
                                        }}
                                        onBlur={(e) => {
                                            if (e.relatedTarget && e.relatedTarget.classList.contains('ldp-cancel-name-btn')) {
                                                return;
                                            }
                                            void handleSaveName();
                                        }}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-primary ldp-save-name-btn"
                                        onClick={() => void handleSaveName()}
                                        title="Simpan"
                                        style={{ width: '36px', height: '36px', minWidth: '36px', borderRadius: '8px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-secondary ldp-cancel-name-btn"
                                        onClick={() => setEditName(false)}
                                        title="Batal"
                                        style={{ width: '36px', height: '36px', minWidth: '36px', borderRadius: '8px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="18" y1="6" x2="6" y2="18" />
                                            <line x1="6" y1="6" x2="18" y2="18" />
                                        </svg>
                                    </button>
                                </div>
                                {nameError && <div className="ldp-field-error" style={{ color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 500 }}>{nameError}</div>}
                            </div>
                        ) : (
                            <h1 className="ldp-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {lead.name}
                                {canEditProfile && (
                                    <button
                                        type="button"
                                        className="ldp-edit-name-icon-btn"
                                        onClick={() => {
                                            setTempName(lead.name || '');
                                            setEditName(true);
                                        }}
                                        title="Edit Nama"
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', margin: '-8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                        </svg>
                                    </button>
                                )}
                            </h1>
                        )}
                        <div className="ldp-status-row">
                            <span className={`badge ${getStatusBadgeClass('flow', effectiveFlowStatus)}`}>{getFlowStatusLabel(effectiveFlowStatus)}</span>
                            {appointmentTag !== 'none' ? <span className={`badge ${getStatusBadgeClass('appointment', appointmentTag)}`}>{getAppointmentTagLabel(appointmentTag)}</span> : null}
                            {lead.resultStatus ? <span className={`badge ${getStatusBadgeClass('result', lead.resultStatus)}`}>{getResultStatusLabel(lead.resultStatus)}</span> : null}
                        </div>
                    </div>
                </div>

                <div className={`ldp-info-grid ${editSales ? 'is-editing-sales' : ''}`}>
                    <div className="ldp-info-item">
                        <span className="ldp-info-label">WhatsApp</span>
                        <span className="ldp-info-value">{lead.phone}</span>
                    </div>
                    <div className="ldp-info-item">
                        <span className="ldp-info-label">Sales</span>
                        <span className="ldp-info-value">
                            {editSales ? (
                                <div className="ldp-edit-inline-wrap" style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
                                    <div style={{ flex: 1, maxWidth: '240px' }}>
                                        <SelectFilter
                                            options={[
                                                { value: '', label: 'Open (tanpa sales)' },
                                                ...salesUsers.map((s) => ({ value: s.id, label: s.name }))
                                            ]}
                                            value={tempSales}
                                            onChange={(val) => setTempSales(val)}
                                            placeholder="Pilih Sales"
                                            clearable={false}
                                            searchable
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-primary ldp-save-sales-btn"
                                        onClick={() => void handleSaveSales()}
                                        title="Simpan"
                                        style={{ width: '38px', height: '38px', minWidth: '38px', borderRadius: '8px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-secondary ldp-cancel-sales-btn"
                                        onClick={() => setEditSales(false)}
                                        title="Batal"
                                        style={{ width: '38px', height: '38px', minWidth: '38px', borderRadius: '8px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="18" y1="6" x2="6" y2="18" />
                                            <line x1="6" y1="6" x2="18" y2="18" />
                                        </svg>
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {getSalesNameById(lead.assignedTo)}
                                    {isAdmin && (
                                        <button
                                            type="button"
                                            className="ldp-edit-name-icon-btn"
                                            onClick={() => {
                                                setTempSales(lead.assignedTo || '');
                                                setEditSales(true);
                                            }}
                                            title="Assign Sales"
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', margin: '-8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                            </svg>
                                        </button>
                                    )}
                                </>
                            )}
                        </span>
                    </div>
                    <div className="ldp-info-item">
                        <span className="ldp-info-label">Tanggal Masuk</span>
                        <span className="ldp-info-value">{formatDate(lead.createdAt)}</span>
                    </div>
                    {lead.acceptedAt ? (
                        <div className="ldp-info-item">
                            <span className="ldp-info-label">Diterima</span>
                            <span className="ldp-info-value">{formatExactDateTime(lead.acceptedAt)}</span>
                        </div>
                    ) : null}
                </div>

                {/* Inline edit: Sumber Leads + Domisili */}
                <div className="ldp-editable-row">
                    <form onSubmit={handleSubmitSource(handleSaveSourceDomicile)} className="ldp-editable-row-head" style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between', width: '100%', border: 'none', padding: 0, margin: 0, background: 'none' }}>
                        <div className="ldp-editable-pairs">
                            <div className="ldp-editable-pair">
                                <span className="ldp-info-label">Sumber Leads</span>
                                {editSourceDomicile ? (
                                    <div className="ldp-edit-inline-wrap" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        <div style={{ minWidth: '140px' }}>
                                            <Controller
                                                name="source"
                                                control={controlSource}
                                                render={({ field }) => (
                                                    <SelectFilter
                                                        options={availableLeadSources.map((s) => ({ value: s, label: s }))}
                                                        value={field.value}
                                                        onChange={field.onChange}
                                                        placeholder={availableLeadSources.length === 0 ? 'Belum tersedia' : 'Pilih sumber'}
                                                        disabled={availableLeadSources.length === 0}
                                                        clearable={false}
                                                    />
                                                )}
                                            />
                                            {sourceErrors.source && <div className="ldp-field-error" style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '4px', fontWeight: 500 }}>{sourceErrors.source.message}</div>}
                                        </div>
                                        {isAgentSource(watchedSource) && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <input
                                                    type="text"
                                                    className="input-field"
                                                    style={{ width: '120px', padding: '6px 10px', fontSize: '0.8125rem', height: '38px', margin: 0 }}
                                                    placeholder="Nama kantor agent"
                                                    {...registerSource('agentOfficeName')}
                                                />
                                                {sourceErrors.agentOfficeName && <div className="ldp-field-error" style={{ color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 500 }}>{sourceErrors.agentOfficeName.message}</div>}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <span className="ldp-info-value">{lead.source || '-'}{lead.agentOfficeName ? ` · ${lead.agentOfficeName}` : ''}</span>
                                )}
                            </div>
                            <div className="ldp-editable-pair">
                                <span className="ldp-info-label">Domisili</span>
                                {editSourceDomicile ? (
                                    <div style={{ minWidth: '140px' }}>
                                        <Controller
                                            name="domicileCity"
                                            control={controlSource}
                                            render={({ field }) => (
                                                <SelectFilter
                                                    options={INDONESIA_CITIES.map((city) => ({ value: city, label: city }))}
                                                    value={field.value || ''}
                                                    onChange={field.onChange}
                                                    placeholder="Pilih kota"
                                                    clearable
                                                    searchable
                                                />
                                            )}
                                        />
                                    </div>
                                ) : (
                                    <span className="ldp-info-value">{lead.domicileCity || '-'}</span>
                                )}
                            </div>
                        </div>

                        {canEditProfile && (
                            <div className="ldp-row-action-wrap">
                                {editSourceDomicile ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <button
                                            type="submit"
                                            className="btn btn-sm btn-primary ldp-save-sourcedomicile-btn"
                                            title="Simpan"
                                            style={{ width: '38px', height: '38px', minWidth: '38px', borderRadius: '8px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-secondary ldp-cancel-sourcedomicile-btn"
                                            onClick={() => {
                                                resetSource();
                                                setEditSourceDomicile(false);
                                            }}
                                            title="Batal"
                                            style={{ width: '38px', height: '38px', minWidth: '38px', borderRadius: '8px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="18" y1="6" x2="6" y2="18" />
                                                <line x1="6" y1="6" x2="18" y2="18" />
                                            </svg>
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        className="ldp-edit-name-icon-btn"
                                        onClick={() => {
                                            resetSource({
                                                source: lead.source || availableLeadSources[0] || '',
                                                agentOfficeName: lead.agentOfficeName || '',
                                                domicileCity: lead.domicileCity || '',
                                            });
                                            setEditSourceDomicile(true);
                                        }}
                                        title="Edit Sumber & Domisili"
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', margin: '-8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        )}
                    </form>
                </div>

                {lead.manualNote ? (
                    <div className="ldp-note-block">
                        <span className="ldp-note-label">Catatan</span>
                        <p className="ldp-note-text">{lead.manualNote}</p>
                    </div>
                ) : null}

                {requestError ? <div className="ldp-alert ldp-alert-error">{requestError}</div> : null}

                {needsNewLeadTaskAcceptance ? (
                    <div className="ldp-alert ldp-alert-info">
                        Lead ini harus diterima lewat <strong>Tasks › New Leads</strong>. Submit screenshot proof dan status L2 di sana untuk mengubah status lead menjadi Accepted.
                        <button className="btn btn-primary btn-full" style={{ marginTop: 10 }} onClick={() => router.push('/daily-tasks')}>
                            Buka Daily Task
                        </button>
                    </div>
                ) : null}

                <div className="ldp-card-actions">
                    <a href={toWaLink(lead.phone)} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp">
                        Chat WhatsApp
                    </a>
                    <button
                        type="button"
                        className={`btn ldp-status-action-btn is-${lead.salesStatus || 'none'}`}
                        onClick={() => setShowProspectStatusSheet(true)}
                        disabled={!canEditProspectStatus}
                    >
                        Prospect Status : {lead.salesStatus ? getSalesStatusLabel(lead.salesStatus) : 'Belum Diisi'}
                    </button>
                    <button className="btn btn-secondary" onClick={() => { setNote(lead.manualNote || ''); setShowNote(true); }} disabled={!canEditProfile}>
                        {lead.manualNote ? 'Ubah Catatan' : 'Tambah Catatan'}
                    </button>
                </div>
            </div>

            {/* ── Tabs ─────────────────────────────────────────── */}
            <div className="ldp-tabs">
                <div className="ldp-tab-bar">
                    {([['action', 'Action'], ['pipeline', 'Pipeline'], ['fu_logs', 'FU Logs']]).map(([key, label]) => (
                        <button key={key} className={`ldp-tab-btn${activeTab === key ? ' is-active' : ''}`} onClick={() => setActiveTab(key)}>{label}</button>
                    ))}
                </div>

                {/* ── Action tab ──────────────────────────────── */}
                {activeTab === 'action' ? (
                    <div className="ldp-tab-pane">
                        {/* Product / Interest unit */}
                        <div className="ldp-action-card">
                            <h4 className="ldp-action-card-title">Product</h4>
                            <SelectFilter
                                options={unitOptions.map((item) => ({ value: item.id, label: `${item.projectType} - ${item.unitName}` }))}
                                value={interestUnitId}
                                onChange={(val) => void handleInterestUnitChange(val)}
                                placeholder={unitsLoading ? 'Loading unit...' : 'Pilih tipe unit'}
                                disabled={!canEditInterestUnit || unitsLoading}
                                clearable={true}
                                searchable={true}
                            />
                            {lead.interestProjectType && lead.interestUnitName ? (
                                <p className="ldp-inline-hint" style={{ marginTop: 6 }}>{lead.interestProjectType} – {lead.interestUnitName}</p>
                            ) : null}
                        </div>

                        {/* Appointment */}
                        <div className="ldp-action-card">
                            <div className="ldp-action-card-head">
                                <h4 className="ldp-action-card-title">Appointment</h4>
                                <button
                                    type="button"
                                    className={`btn btn-sm ${showInlineAppt ? 'btn-secondary' : 'btn-primary'}`}
                                    onClick={() => {
                                        const nowDate = getNowDateStr();
                                        const nowTime = getNowTimeStr();
                                        setShowInlineAppt((prev) => !prev);
                                        setEditingAppointment(null);
                                        setAppt({ date: nowDate, time: nowTime, location: '', notes: '', status: 'mau_survey' });
                                    }}
                                    disabled={!canEditLead}
                                >
                                    {showInlineAppt ? 'Batal' : 'Buat'}
                                </button>
                            </div>
                            {showInlineAppt ? (
                                <form className="ldp-inline-appt-form" onSubmit={(e) => void handleAddAppt(e)}>
                                    <DatePicker
                                        label="Tanggal & Waktu"
                                        showTime={true}
                                        value={appt.date && appt.time ? `${appt.date}T${appt.time}` : ''}
                                        onChange={(val) => {
                                            if (!val) {
                                                setAppt({ ...appt, date: '', time: '' });
                                            } else {
                                                const [d, t] = val.split('T');
                                                setAppt({ ...appt, date: d, time: t });
                                            }
                                        }}
                                        required
                                    />
                                    <div className="input-group">
                                        <label>Lokasi</label>
                                        <input type="text" className="input-field" placeholder="Contoh: BSD City, Tangerang" value={appt.location} onChange={(event) => setAppt({ ...appt, location: event.target.value })} required />
                                    </div>
                                    <button type="submit" className="btn btn-primary btn-full">Buat Jadwal</button>
                                </form>
                            ) : null}
                            <div className="ldp-appt-status-row">
                                <button type="button" className={`badge ${apptStatusFilter === 'all' ? 'badge-neutral badge-active' : 'badge-neutral'}`} onClick={() => setApptStatusFilter('all')}>Semua</button>
                                {APPOINTMENT_TAGS.map((tag) => (
                                    <button key={tag.key} type="button" className={`badge ${apptStatusFilter === tag.key ? getStatusBadgeClass('appointment', tag.key) : 'badge-neutral'}`} onClick={() => setApptStatusFilter(tag.key)}>{tag.label}</button>
                                ))}
                            </div>
                            {lead.appointments?.length > 0 ? (
                                <div className="ldp-appt-list">
                                    {lead.appointments
                                        .filter((item) => apptStatusFilter === 'all' ? item.status !== 'dibatalkan' : item.status === apptStatusFilter)
                                        .map((item) => (
                                        <div key={item.id} className="ldp-appt-card">
                                            <div className="ldp-appt-head">
                                                <div className="ldp-appt-datetime">{formatApptDate(item.date)} · {item.time}</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span className={`badge ${getStatusBadgeClass('appointment', item.status)}`}>{getAppointmentTagLabel(item.status || 'mau_survey')}</span>
                                                    {canEditLead ? (
                                                        <button type="button" className="ldp-appt-edit-btn" onClick={() => openEditAppointment(item)} title="Edit appointment">
                                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </div>
                                            <div className="ldp-appt-location">{item.location}</div>
                                            {item.notes ? <div className="ldp-appt-notes">{item.notes}</div> : null}
                                            {canEditLead && item.status !== 'dibatalkan' && item.status !== 'sudah_survey' ? (
                                                <div className="ldp-appt-actions-wrap">
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-appt-done"
                                                        onClick={() => void handleQuickSudahSurvey(item)}
                                                        title="Tandai sudah survey"
                                                    >
                                                        ✓ Sudah Survey
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-appt-reschedule"
                                                        onClick={() => handleQuickReschedule(item)}
                                                        title="Reschedule"
                                                    >
                                                        ↺ Reschedule
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-appt-cancel"
                                                        onClick={() => void handleCancelAppointment(item)}
                                                        title="Batal Survey"
                                                    >
                                                        ✕ Batal Survey
                                                    </button>
                                                </div>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="ldp-section-desc">Belum ada appointment.</p>
                            )}
                        </div>

                        {/* Transaction / Result */}
                        <div className="ldp-action-card">
                            <h4 className="ldp-action-card-title">Transaction</h4>
                            {isLockedByAkad ? (
                                <div className="ldp-alert ldp-alert-error" style={{ marginBottom: 12 }}>Lead terkunci — sudah mencapai status Akad.</div>
                            ) : null}
                            <form onSubmit={handleSubmitResult(handleSaveResult)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div className="input-group">
                                    <Controller
                                        name="resultStatus"
                                        control={controlResult}
                                        render={({ field }) => (
                                            <SelectFilter
                                                options={RESULT_STATUSES.map((item) => ({ value: item.key, label: item.label }))}
                                                value={field.value}
                                                onChange={field.onChange}
                                                placeholder="Pilih status transaksi"
                                                disabled={!canUpdateResult}
                                                clearable={false}
                                            />
                                        )}
                                    />
                                    {resultErrors.resultStatus && <div className="ldp-field-error" style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '4px', fontWeight: 500 }}>{resultErrors.resultStatus.message}</div>}
                                </div>
                                {watchedResultStatus === 'akad' ? (
                                    <>
                                        <div className="input-group">
                                            <label>Nama Unit</label>
                                            <input className="input-field" disabled={!canUpdateResult} {...registerResult('unitName')} />
                                            {resultErrors.unitName && <div className="ldp-field-error" style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '4px', fontWeight: 500 }}>{resultErrors.unitName.message}</div>}
                                        </div>
                                        <div className="input-group">
                                            <label>Detail Unit</label>
                                            <textarea className="input-field" rows={3} disabled={!canUpdateResult} style={{ resize: 'vertical' }} {...registerResult('unitDetail')} />
                                            {resultErrors.unitDetail && <div className="ldp-field-error" style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '4px', fontWeight: 500 }}>{resultErrors.unitDetail.message}</div>}
                                        </div>
                                        <div className="input-group">
                                            <label>Cara Bayar</label>
                                            <input className="input-field" disabled={!canUpdateResult} {...registerResult('paymentMethod')} />
                                            {resultErrors.paymentMethod && <div className="ldp-field-error" style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '4px', fontWeight: 500 }}>{resultErrors.paymentMethod.message}</div>}
                                        </div>
                                    </>
                                ) : null}
                                {isCancelResultStatus(watchedResultStatus) ? (
                                    <>
                                        <div className="input-group">
                                            <label>Alasan Cancel</label>
                                            <Controller
                                                name="rejectedReason"
                                                control={controlResult}
                                                render={({ field }) => (
                                                    <SelectFilter
                                                        options={cancelReasons.map((item) => ({ value: item.code, label: item.label }))}
                                                        value={field.value || ''}
                                                        onChange={field.onChange}
                                                        placeholder={cancelReasonsLoading ? 'Loading alasan...' : 'Pilih alasan cancel'}
                                                        disabled={!canUpdateResult || cancelReasonsLoading}
                                                        clearable={false}
                                                    />
                                                )}
                                            />
                                            {resultErrors.rejectedReason && <div className="ldp-field-error" style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '4px', fontWeight: 500 }}>{resultErrors.rejectedReason.message}</div>}
                                        </div>
                                        <div className="input-group">
                                            <label>Catatan Cancel</label>
                                            <textarea className="input-field" rows={3} disabled={!canUpdateResult} style={{ resize: 'vertical' }} {...registerResult('rejectedNote')} />
                                        </div>
                                    </>
                                ) : null}
                                <div className="ldp-current-meta">
                                    <span>Saat ini: <strong>{lead.resultStatus ? getResultStatusLabel(lead.resultStatus) : '-'}</strong></span>
                                    {isCancelResultStatus(lead.resultStatus) ? <span>Reason: <strong>{getCancelReasonLabel(lead.rejectedReason)}</strong></span> : null}
                                </div>
                                <button type="submit" className="btn btn-primary btn-full" disabled={!canUpdateResult}>Simpan Transaksi</button>
                            </form>
                        </div>
                    </div>
                ) : null}

                {/* ── Pipeline tab ────────────────────────────── */}
                {activeTab === 'pipeline' ? (
                    <div className="ldp-tab-pane">
                        {isAcceptedLead ? (
                            <>
                                {(() => {
                                    const doneCount = customerPipelineRows.filter((r) => r.status === 'done').length;
                                    const totalCount = customerPipelineRows.length;
                                    return (
                                        <div className="ldp-pipeline-header">
                                            <div className="ldp-pipeline-header-top">
                                                <h3 className="ldp-section-title" style={{ marginBottom: 0 }}>Customer Pipeline</h3>
                                                <span className={`ldp-pipeline-count-badge${doneCount === totalCount ? ' is-complete' : ''}`}>{doneCount}/{totalCount} selesai</span>
                                            </div>
                                            <p className="ldp-section-desc">Progress terisi otomatis saat proof day 4, 8, dan 12 disubmit di Daily Task.</p>
                                            <div className="ldp-pipeline-stepper">
                                                {customerPipelineRows.flatMap((step, idx) => {
                                                    const isDone = step.status === 'done';
                                                    const isPending = step.status === 'pending';
                                                    const isOverdue = step.status === 'overdue';
                                                    const nodeClass = `ldp-ps-node${isDone ? ' is-done' : isOverdue ? ' is-overdue' : isPending ? ' is-pending' : ''}`;
                                                    const items = [
                                                        <div key={`step-${step.stepNo}`} className="ldp-ps-item">
                                                            <div className={nodeClass}>
                                                                {isDone ? (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>) : (<span>{step.stepNo}</span>)}
                                                            </div>
                                                            <span className="ldp-ps-label">{step.label}</span>
                                                            <span className={`ldp-ps-status${isDone ? ' is-done' : isOverdue ? ' is-overdue' : isPending ? ' is-pending' : ''}`}>{isDone ? 'Done' : isOverdue ? 'Overdue' : isPending ? 'Pending' : 'Upcoming'}</span>
                                                        </div>,
                                                    ];
                                                    if (idx < customerPipelineRows.length - 1) {
                                                        items.push(<div key={`line-${idx}`} className={`ldp-ps-line${isDone ? ' is-filled' : ''}`} />);
                                                    }
                                                    return items;
                                                })}
                                            </div>
                                        </div>
                                    );
                                })()}
                                <div className="ldp-card ldp-pipeline-list">
                                    {customerPipelineRows.map((step) => (
                                        <div key={step.stepNo} className={`ldp-pipeline-row${step.status === 'done' ? ' is-done' : ''}`}>
                                            <div className="ldp-pipeline-row-inner">
                                                <div className="ldp-pipeline-main">
                                                    <div className="ldp-pipeline-badges">
                                                        <span className={`badge ${step.status === 'done' ? 'badge-success' : step.status === 'overdue' ? 'badge-danger' : step.status === 'pending' ? 'badge-warm' : 'badge-neutral'}`}>{step.label}</span>
                                                        <span className={`badge ${step.status === 'done' ? 'badge-success' : step.status === 'overdue' ? 'badge-danger' : step.status === 'pending' ? 'badge-info' : 'badge-neutral'}`}>{step.status === 'done' ? 'Done' : step.status === 'overdue' ? 'Overdue' : step.status === 'pending' ? 'Pending' : 'Upcoming'}</span>
                                                    </div>
                                                    <p className="ldp-pipeline-summary">
                                                        {step.status === 'done' ? `Proof disubmit${step.completedAt ? ` pada ${formatExactDateTime(step.completedAt)}` : ''}.`
                                                            : step.status === 'overdue' ? `Belum disubmit. Deadline ${formatExactDateTime(step.dueAt)}.`
                                                                : step.status === 'pending' ? `Aktif${step.dueAt ? `, deadline ${formatExactDateTime(step.dueAt)}` : ''}.`
                                                                    : `Aktif ${formatExactDateTime(step.eligibleAt)}.`}
                                                    </p>
                                                    {step.eligibleAt ? (
                                                        <div className="ldp-pipeline-meta">
                                                            <span>Mulai: {formatExactDateTime(step.eligibleAt)}</span>
                                                            {step.dueAt ? <span>Batas Waktu: {formatExactDateTime(step.dueAt)}</span> : null}
                                                        </div>
                                                    ) : null}
                                                </div>
                                                <div className="ldp-pipeline-proof">
                                                    {step.screenshotUrl ? (
                                                        <a className="ldp-proof-link" href={step.screenshotUrl} target="_blank" rel="noopener noreferrer">
                                                            <img src={step.screenshotUrl} alt={`${step.label} proof`} className="ldp-proof-img" />
                                                            <span className="btn btn-sm btn-secondary">Lihat Proof</span>
                                                        </a>
                                                    ) : (
                                                        <span className="ldp-section-desc" style={{ margin: 0 }}>Submit lewat Daily Task</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <p className="ldp-section-desc" style={{ padding: '16px 0' }}>Pipeline tersedia setelah lead di-accept.</p>
                        )}
                    </div>
                ) : null}

                {/* ── FU Logs tab ─────────────────────────────── */}
                {activeTab === 'fu_logs' ? (
                    <div className="ldp-tab-pane">
                        <div className="ldp-card ldp-activity-list">
                            {(lead.activities || []).length === 0 ? (
                                <p className="ldp-section-desc" style={{ padding: '8px 0' }}>Belum ada aktivitas.</p>
                            ) : (lead.activities || []).map((item) => (
                                <div key={item.id} className="ldp-activity-item">
                                    <div className="ldp-activity-dot" />
                                    <div className="ldp-activity-body">
                                        <span className="ldp-activity-text">{item.note}</span>
                                        <span className="ldp-activity-time">{getTimeAgo(item.timestamp)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}
            </div>

            {showNote ? (
                <div className="sheet-overlay" onClick={(event) => { if (event.target === event.currentTarget) setShowNote(false); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>{lead.manualNote ? 'Ubah Catatan' : 'Tambah Catatan'}</h2>
                        <form onSubmit={handleAddNote} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div className="input-group">
                                <label>Catatan</label>
                                <textarea className="input-field" placeholder="Tulis catatan aktivitas..." rows={4} value={note} onChange={(event) => setNote(event.target.value)} required style={{ resize: 'vertical' }} />
                            </div>
                            <button type="submit" className="btn btn-primary btn-full">Simpan</button>
                            <button type="button" className="btn btn-secondary btn-full" onClick={() => setShowNote(false)}>Batal</button>
                        </form>
                    </div>
                </div>
            ) : null}

            {showAppt ? (
                <div className="sheet-overlay" onClick={(event) => { if (event.target === event.currentTarget) { setShowAppt(false); setEditingAppointment(null); } }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>Edit Appointment</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: 16 }}>Client: <strong>{lead.name}</strong></p>
                        <form onSubmit={handleAddAppt} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <DatePicker
                                label="Tanggal & Waktu"
                                showTime={true}
                                value={appt.date && appt.time ? `${appt.date}T${appt.time}` : ''}
                                onChange={(val) => {
                                    if (!val) {
                                        setAppt({ ...appt, date: '', time: '' });
                                    } else {
                                        const [d, t] = val.split('T');
                                        setAppt({ ...appt, date: d, time: t });
                                    }
                                }}
                                required
                            />
                            <div className="input-group">
                                <label>Lokasi</label>
                                <input type="text" className="input-field" placeholder="Contoh: BSD City, Tangerang" value={appt.location} onChange={(event) => setAppt({ ...appt, location: event.target.value })} required />
                            </div>
                            <div className="input-group">
                                <label>Catatan</label>
                                <textarea className="input-field" placeholder="Catatan tambahan..." rows={3} value={appt.notes} onChange={(event) => setAppt({ ...appt, notes: event.target.value })} style={{ resize: 'vertical' }} />
                            </div>
                            <div className="input-group">
                                <label>Status Janji Temu</label>
                                <SelectFilter
                                    options={APPOINTMENT_TAGS.map((tag) => ({ value: tag.key, label: tag.label }))}
                                    value={appt.status}
                                    onChange={(val) => setAppt({ ...appt, status: val || 'mau_survey' })}
                                    placeholder="Pilih status..."
                                    clearable={false}
                                />
                            </div>
                            <button type="submit" className="btn btn-primary btn-full">Simpan Appointment</button>
                            <button type="button" className="btn btn-secondary btn-full" onClick={() => { setShowAppt(false); setEditingAppointment(null); }}>Batal</button>
                        </form>
                    </div>
                </div>
            ) : null}



            {deleteLeadState.open ? (
                <div className="sheet-overlay" onClick={(event) => {
                    if (event.target === event.currentTarget && !deleteLeadState.submitting) {
                        setDeleteLeadState({ open: false, passwordConfirmation: '', submitting: false, error: '' });
                    }
                }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>Hapus Lead</h2>
                        <div className="team-lifecycle-copy">
                            <p>
                                Lead <strong>{lead.name}</strong> akan dihapus permanen beserta data turunannya di workspace ini.
                            </p>
                            <p className="team-modal-helper">
                                Masukkan password admin sebagai validasi terakhir sebelum data dihapus.
                            </p>
                        </div>
                        <div className="input-group">
                            <label>Password Admin</label>
                            <input
                                type="password"
                                className="input-field"
                                value={deleteLeadState.passwordConfirmation}
                                onChange={(event) => setDeleteLeadState((prev) => ({
                                    ...prev,
                                    passwordConfirmation: event.target.value,
                                    error: '',
                                }))}
                                placeholder="Masukkan password admin"
                            />
                        </div>
                        {deleteLeadState.error ? <div className="login-error">{deleteLeadState.error}</div> : null}
                        <div className="team-lifecycle-actions">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setDeleteLeadState({ open: false, passwordConfirmation: '', submitting: false, error: '' })}
                                disabled={deleteLeadState.submitting}
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={() => void handleDeleteLead()}
                                disabled={deleteLeadState.submitting}
                            >
                                {deleteLeadState.submitting ? 'Menghapus...' : 'Ya, Hapus Lead'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {showProspectStatusSheet && canEditProspectStatus ? (
                <div className="sheet-overlay" onClick={(event) => { if (event.target === event.currentTarget) setShowProspectStatusSheet(false); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>Pilih Prospect Status</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                            {visibleSalesStatuses.map((item) => {
                                let statusClass = 'is-neutral';
                                if (item.key === 'hot') statusClass = 'is-hot';
                                else if (item.key === 'warm') statusClass = 'is-warm';
                                else if (['cold', 'no_response'].includes(item.key)) statusClass = 'is-cold';

                                return (
                                    <button
                                        key={item.key}
                                        type="button"
                                        className={`btn btn-full ldp-status-option-btn ${statusClass}`}
                                        onClick={() => void handleUpdateProspectStatus(item.key)}
                                    >
                                        {item.label} {item.key === lead.salesStatus ? '✓' : ''}
                                    </button>
                                );
                            })}
                            <button type="button" className="btn btn-secondary btn-full" onClick={() => setShowProspectStatusSheet(false)} style={{ marginTop: 8 }}>
                                Batal
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
