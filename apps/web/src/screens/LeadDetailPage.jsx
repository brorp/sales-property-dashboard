'use client';

import { useEffect, useMemo, useState } from 'react';
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
import PickerTriggerField from '../components/PickerTriggerField';
import SelectFilter from '../components/SelectFilter';
import { apiRequest } from '../lib/api';
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

    const [showAppt, setShowAppt] = useState(false);
    const [showNote, setShowNote] = useState(false);
    const [showReassign, setShowReassign] = useState(false);
    const [editingAppointment, setEditingAppointment] = useState(null);
    const [note, setNote] = useState('');
    const [appt, setAppt] = useState({
        date: '',
        time: '',
        location: '',
        notes: '',
        status: 'mau_survey',
    });
    const [flow2Form, setFlow2Form] = useState({
        name: '',
        source: '',
        agentOfficeName: '',
        salesStatus: '',
        domicileCity: '',
        interestUnitId: '',
    });
    const [resultForm, setResultForm] = useState({
        resultStatus: '',
        unitName: '',
        unitDetail: '',
        paymentMethod: '',
        rejectedReason: '',
        rejectedNote: '',
    });
    const [requestError, setRequestError] = useState('');
    const [requestSuccess, setRequestSuccess] = useState('');
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
    const [inlineEdit, setInlineEdit] = useState(false);
    const [showInlineAppt, setShowInlineAppt] = useState(false);

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

        setFlow2Form({
            name: lead.name || '',
            source: lead.source || availableLeadSources[0] || '',
            agentOfficeName: lead.agentOfficeName || '',
            salesStatus: lead.salesStatus || 'warm',
            domicileCity: lead.domicileCity || '',
            interestUnitId: lead.interestUnitId || '',
        });
        setResultForm({
            resultStatus: normalizeResultStatusForForm(lead.resultStatus),
            unitName: lead.unitName || '',
            unitDetail: lead.unitDetail || '',
            paymentMethod: lead.paymentMethod || '',
            rejectedReason: lead.rejectedReason || '',
            rejectedNote: lead.rejectedNote || '',
        });
    }, [availableLeadSources, lead]);

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
    const canUpdateResult = canEditLead && !isLockedByAkad;
    const leadAllowsDelayedStatuses = isOlderThanDays(lead?.createdAt, SALES_STATUS_COLD_OPEN_DAYS);
    const visibleSalesStatuses = SALES_STATUSES.filter((item) => (
        leadAllowsDelayedStatuses ||
        !['cold', 'no_response'].includes(item.key) ||
        item.key === flow2Form.salesStatus ||
        item.key === lead?.salesStatus
    ));
    const customerPipelineRows = useMemo(() => buildCustomerPipelineRows(lead), [lead]);

    const runLeadUpdate = async (payload, successMessage = 'Update berhasil disimpan.') => {
        try {
            setRequestError('');
            setRequestSuccess('');
            await updateLead(lead.id, payload);
            setRequestSuccess(successMessage);
            return true;
        } catch (err) {
            setRequestError(err instanceof Error ? err.message : 'Failed updating lead');
            return false;
        }
    };

    const runAddAppointment = async (payload) => {
        try {
            setRequestError('');
            setRequestSuccess('');
            if (editingAppointment?.id) {
                await updateAppointment(editingAppointment.id, payload);
            } else {
                await addAppointment(lead.id, payload);
                setShowInlineAppt(false);
            }
            setAppt({ date: '', time: '', location: '', notes: '', status: 'mau_survey' });
            setEditingAppointment(null);
            setShowAppt(false);
            setRequestSuccess(
                editingAppointment?.id
                    ? 'Janji temu berhasil diperbarui.'
                    : 'Janji temu berhasil dibuat.'
            );
        } catch (err) {
            setRequestError(err instanceof Error ? err.message : 'Failed saving appointment');
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

    const handleSaveInlineEdit = async () => {
        if (!canEditProfile) return;
        if (!flow2Form.source) {
            setRequestError('Source lead wajib dipilih.');
            return;
        }
        if (isAgentSource(flow2Form.source) && !flow2Form.agentOfficeName.trim()) {
            setRequestError('Nama kantor wajib diisi untuk source Agent.');
            return;
        }
        if (canUpdateLayer2 && !flow2Form.salesStatus) {
            setRequestError('Sales status wajib dipilih.');
            return;
        }
        const payload = {
            source: flow2Form.source,
            agentOfficeName: isAgentSource(flow2Form.source) ? flow2Form.agentOfficeName : null,
            domicileCity: flow2Form.domicileCity || null,
            activityNote: 'Profile info diperbarui',
        };
        if (canUpdateLayer2) {
            payload.salesStatus = flow2Form.salesStatus;
        }
        const ok = await runLeadUpdate(payload, 'Info berhasil disimpan.');
        if (ok) setInlineEdit(false);
    };

    const handleInterestUnitChange = async (unitId) => {
        if (!canEditLead || !canUpdateLayer2) return;
        setFlow2Form((prev) => ({ ...prev, interestUnitId: unitId }));
        await runLeadUpdate({
            interestUnitId: unitId || null,
            activityNote: 'Interest unit diperbarui',
        }, 'Unit berhasil disimpan.');
    };

    const handleSaveResult = async (event) => {
        event.preventDefault();
        if (!canEditLead) {
            return;
        }

        if (!resultForm.resultStatus) {
            setRequestError('Result status wajib dipilih.');
            return;
        }

        if (resultForm.resultStatus === 'akad') {
            if (!resultForm.unitName || !resultForm.unitDetail || !resultForm.paymentMethod) {
                setRequestError('Untuk status akad, unit name, detail unit, dan payment method wajib diisi.');
                return;
            }

            await runLeadUpdate({
                resultStatus: 'akad',
                unitName: resultForm.unitName,
                unitDetail: resultForm.unitDetail,
                paymentMethod: resultForm.paymentMethod,
            }, 'Result status berhasil diubah ke Akad.');
            return;
        }

        if (isCancelResultStatus(resultForm.resultStatus)) {
            if (!resultForm.rejectedReason) {
                setRequestError('Alasan cancel wajib dipilih.');
                return;
            }

            if (!resultForm.rejectedNote.trim()) {
                setRequestError('Catatan cancel wajib diisi.');
                return;
            }

            await runLeadUpdate({
                resultStatus: resultForm.resultStatus,
                rejectedReason: resultForm.rejectedReason,
                rejectedNote: resultForm.rejectedNote.trim(),
            }, `Result status berhasil diubah ke ${getResultStatusLabel(resultForm.resultStatus)}. Status L2 otomatis menjadi Skip.`);
            return;
        }

        await runLeadUpdate({
            resultStatus: resultForm.resultStatus,
        }, `Result status berhasil diubah ke ${getResultStatusLabel(resultForm.resultStatus)}.`);
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

    const openCreateAppointment = () => {
        setEditingAppointment(null);
        setAppt({
            date: '',
            time: '',
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

    const handleCancelAppointment = async (item) => {
        if (!item?.id) {
            return;
        }

        const confirmed = window.confirm('Tandai appointment ini sebagai dibatalkan?');
        if (!confirmed) {
            return;
        }

        try {
            setRequestError('');
            setRequestSuccess('');
            await cancelAppointment(item.id, {
                notes: item.notes || null,
            });
            setRequestSuccess('Janji temu berhasil dibatalkan.');
        } catch (err) {
            setRequestError(err instanceof Error ? err.message : 'Failed cancelling appointment');
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
            setRequestError('');
            await deleteLead(lead.id, deleteLeadState.passwordConfirmation);
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

    return (
        <div className="page-container dash-page leads-page">
            <Header
                title="Detail Lead"
                showBack
                rightAction={(
                    <>
                        {canDeleteLead ? (
                            <button
                                className="btn btn-sm btn-danger btn-icon-only"
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
                            className="btn btn-sm btn-secondary btn-icon-only"
                            onClick={() => void handleRefresh()}
                            disabled={refreshing}
                            title="Refresh"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={refreshing ? { animation: 'btnSpin 0.7s linear infinite' } : {}}>
                                <polyline points="23 4 23 10 17 10" />
                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                            </svg>
                        </button>
                    </>
                )}
            />

            {/* ── Profile card ─────────────────────────────────── */}
            <div className="ldp-profile-card">
                <div className="ldp-profile-head">
                    <UserAvatar name={lead.name} size="md" shape="circle" />
                    <div className="ldp-profile-identity">
                        <h1 className="ldp-name">{lead.name}</h1>
                        <div className="ldp-status-row">
                            <span className={`badge ${getStatusBadgeClass('flow', effectiveFlowStatus)}`}>{getFlowStatusLabel(effectiveFlowStatus)}</span>
                            {appointmentTag !== 'none' ? <span className={`badge ${getStatusBadgeClass('appointment', appointmentTag)}`}>{getAppointmentTagLabel(appointmentTag)}</span> : null}
                            {lead.resultStatus ? <span className={`badge ${getStatusBadgeClass('result', lead.resultStatus)}`}>{getResultStatusLabel(lead.resultStatus)}</span> : null}
                        </div>
                    </div>
                </div>

                <div className="ldp-info-grid">
                    <div className="ldp-info-item">
                        <span className="ldp-info-label">WhatsApp</span>
                        <span className="ldp-info-value">{lead.phone}</span>
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
                    <div className="ldp-info-item">
                        <span className="ldp-info-label">Sales</span>
                        <span className="ldp-info-value">
                            {getSalesNameById(lead.assignedTo)}
                            {canAdminAssignOpenLead ? (
                                <button className="ldp-reassign-btn" onClick={() => setShowReassign(true)}>Ubah</button>
                            ) : null}
                        </span>
                    </div>
                </div>

                {/* Inline edit: Sumber Leads + Domisili + Prospect Status */}
                <div className="ldp-editable-row">
                    <div className="ldp-editable-row-head">
                        <div className="ldp-editable-pairs">
                            <div className="ldp-editable-pair">
                                <span className="ldp-info-label">Sumber Leads</span>
                                {inlineEdit ? (
                                    <SelectFilter
                                        options={availableLeadSources.map((s) => ({ value: s, label: s }))}
                                        value={flow2Form.source}
                                        onChange={(next) => setFlow2Form({ ...flow2Form, source: next, agentOfficeName: isAgentSource(next) ? flow2Form.agentOfficeName : '' })}
                                        placeholder={availableLeadSources.length === 0 ? 'Belum tersedia' : 'Pilih sumber'}
                                        disabled={availableLeadSources.length === 0}
                                        clearable={false}
                                    />
                                ) : (
                                    <span className="ldp-info-value">{lead.source || '-'}{lead.agentOfficeName ? ` · ${lead.agentOfficeName}` : ''}</span>
                                )}
                            </div>
                            <div className="ldp-editable-pair">
                                <span className="ldp-info-label">Domisili</span>
                                {inlineEdit ? (
                                    <SelectFilter
                                        options={INDONESIA_CITIES.map((city) => ({ value: city, label: city }))}
                                        value={flow2Form.domicileCity}
                                        onChange={(val) => setFlow2Form({ ...flow2Form, domicileCity: val })}
                                        placeholder="Pilih kota"
                                        clearable
                                        searchable
                                    />
                                ) : (
                                    <span className="ldp-info-value">{lead.domicileCity || '-'}</span>
                                )}
                            </div>
                            <div className="ldp-editable-pair">
                                <span className="ldp-info-label">Prospect Status</span>
                                {inlineEdit ? (
                                    <SelectFilter
                                        options={visibleSalesStatuses.map((item) => ({ value: item.key, label: item.label }))}
                                        value={flow2Form.salesStatus}
                                        onChange={(val) => setFlow2Form({ ...flow2Form, salesStatus: val })}
                                        placeholder="Pilih status"
                                        disabled={!canUpdateLayer2}
                                        clearable={false}
                                    />
                                ) : (
                                    <span className="ldp-info-value">
                                        {lead.salesStatus
                                            ? <span className={`badge ${getStatusBadgeClass('sales', lead.salesStatus)}`}>{getSalesStatusLabel(lead.salesStatus)}</span>
                                            : '-'}
                                    </span>
                                )}
                            </div>
                        </div>
                        {canEditProfile ? (
                            <button type="button" className="ldp-inline-edit-btn" onClick={() => setInlineEdit((prev) => !prev)} title={inlineEdit ? 'Tutup' : 'Edit'}>
                                {inlineEdit
                                    ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                    : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                }
                            </button>
                        ) : null}
                    </div>
                    {inlineEdit ? (
                        <div className="ldp-inline-form-fields">
                            {isAgentSource(flow2Form.source) ? (
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label>Nama Kantor Agent</label>
                                    <input type="text" className="input-field" value={flow2Form.agentOfficeName} onChange={(event) => setFlow2Form({ ...flow2Form, agentOfficeName: event.target.value })} placeholder="Nama kantor agent" />
                                </div>
                            ) : null}
                            {canUpdateLayer2 && !leadAllowsDelayedStatuses ? (
                                <p className="ldp-inline-hint">Cold & No Response terbuka setelah {SALES_STATUS_COLD_OPEN_DAYS} hari.</p>
                            ) : null}
                        </div>
                    ) : null}
                    {inlineEdit ? (
                        <div className="ldp-inline-form-actions">
                            <Button size="sm" variant="primary" onClick={() => void handleSaveInlineEdit()}>Simpan</Button>
                            <Button size="sm" variant="ghost" onClick={() => setInlineEdit(false)}>Batal</Button>
                        </div>
                    ) : null}
                </div>

                {lead.manualNote ? (
                    <div className="ldp-note-block">
                        <span className="ldp-note-label">Catatan</span>
                        <p className="ldp-note-text">{lead.manualNote}</p>
                    </div>
                ) : null}

                {requestError ? <div className="ldp-alert ldp-alert-error">{requestError}</div> : null}
                {requestSuccess ? <div className="ldp-alert ldp-alert-success">{requestSuccess}</div> : null}

                {needsNewLeadTaskAcceptance ? (
                    <div className="ldp-alert ldp-alert-info">
                        Lead ini harus diterima lewat <strong>Tasks › New Leads</strong>. Submit screenshot proof dan status L2 di sana untuk mengubah status lead menjadi Accepted.
                        <button className="btn btn-primary btn-full" style={{ marginTop: 10 }} onClick={() => router.push('/daily-tasks')}>
                            Buka Daily Task
                        </button>
                    </div>
                ) : null}

                <div className="ldp-card-actions">
                    <a href={toWaLink(lead.phone)} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp" style={{ flex: 1 }}>
                        Chat WhatsApp
                    </a>
                    <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setNote(lead.manualNote || ''); setShowNote(true); }} disabled={!canEditLead}>
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
                            <select className="input-field" value={flow2Form.interestUnitId} onChange={(event) => void handleInterestUnitChange(event.target.value)} disabled={!canEditLead || !canUpdateLayer2 || unitsLoading}>
                                <option value="">{unitsLoading ? 'Loading unit...' : 'Pilih tipe unit'}</option>
                                {unitOptions.map((item) => <option key={item.id} value={item.id}>{item.projectType} - {item.unitName}</option>)}
                            </select>
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
                                    onClick={() => { setShowInlineAppt((prev) => !prev); setEditingAppointment(null); setAppt({ date: '', time: '', location: '', notes: '', status: 'mau_survey' }); }}
                                    disabled={!canEditLead}
                                >
                                    {showInlineAppt ? 'Batal' : 'Buat'}
                                </button>
                            </div>
                            {showInlineAppt ? (
                                <form className="ldp-inline-appt-form" onSubmit={(e) => void handleAddAppt(e)}>
                                    <PickerTriggerField label="Tanggal" type="date" value={appt.date} onChange={(event) => setAppt({ ...appt, date: event.target.value })} required />
                                    <PickerTriggerField label="Waktu" type="time" value={appt.time} onChange={(event) => setAppt({ ...appt, time: event.target.value })} required />
                                    <div className="input-group">
                                        <label>Lokasi</label>
                                        <input type="text" className="input-field" placeholder="Contoh: BSD City, Tangerang" value={appt.location} onChange={(event) => setAppt({ ...appt, location: event.target.value })} required />
                                    </div>
                                    <button type="submit" className="btn btn-primary btn-full">Buat Jadwal</button>
                                </form>
                            ) : null}
                            <div className="ldp-appt-status-row">
                                {APPOINTMENT_TAGS.map((tag) => (
                                    <span key={tag.key} className={`badge ${appointmentTag === tag.key ? getStatusBadgeClass('appointment', tag.key) : 'badge-neutral'}`}>{tag.label}</span>
                                ))}
                            </div>
                            {lead.appointments?.length > 0 ? (
                                <div className="ldp-appt-list">
                                    {lead.appointments.map((item) => (
                                        <div key={item.id} className="ldp-appt-card">
                                            <div className="ldp-appt-head">
                                                <div className="ldp-appt-datetime">{item.date} · {item.time}</div>
                                                <span className={`badge ${getStatusBadgeClass('appointment', item.status)}`}>{getAppointmentTagLabel(item.status || 'mau_survey')}</span>
                                            </div>
                                            <div className="ldp-appt-location">{item.location}</div>
                                            {item.notes ? <div className="ldp-appt-notes">{item.notes}</div> : null}
                                            {canEditLead ? (
                                                <div className="ldp-appt-actions">
                                                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => openEditAppointment(item)}>Edit</button>
                                                    {item.status !== 'dibatalkan' ? (
                                                        <button type="button" className="btn btn-sm btn-danger" onClick={() => void handleCancelAppointment(item)}>Batalkan</button>
                                                    ) : null}
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
                            <form onSubmit={handleSaveResult} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div className="input-group">
                                    <select className="input-field" value={resultForm.resultStatus} onChange={(event) => setResultForm({ ...resultForm, resultStatus: event.target.value })} disabled={!canUpdateResult}>
                                        <option value="">Pilih status transaksi</option>
                                        {RESULT_STATUSES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                                    </select>
                                </div>
                                {resultForm.resultStatus === 'akad' ? (
                                    <>
                                        <div className="input-group">
                                            <label>Nama Unit</label>
                                            <input className="input-field" value={resultForm.unitName} onChange={(event) => setResultForm({ ...resultForm, unitName: event.target.value })} disabled={!canUpdateResult} />
                                        </div>
                                        <div className="input-group">
                                            <label>Detail Unit</label>
                                            <textarea className="input-field" rows={3} value={resultForm.unitDetail} onChange={(event) => setResultForm({ ...resultForm, unitDetail: event.target.value })} disabled={!canUpdateResult} style={{ resize: 'vertical' }} />
                                        </div>
                                        <div className="input-group">
                                            <label>Cara Bayar</label>
                                            <input className="input-field" value={resultForm.paymentMethod} onChange={(event) => setResultForm({ ...resultForm, paymentMethod: event.target.value })} disabled={!canUpdateResult} />
                                        </div>
                                    </>
                                ) : null}
                                {isCancelResultStatus(resultForm.resultStatus) ? (
                                    <>
                                        <div className="input-group">
                                            <label>Alasan Cancel</label>
                                            <select className="input-field" value={resultForm.rejectedReason} onChange={(event) => setResultForm({ ...resultForm, rejectedReason: event.target.value })} disabled={!canUpdateResult || cancelReasonsLoading}>
                                                <option value="">{cancelReasonsLoading ? 'Loading alasan...' : 'Pilih alasan cancel'}</option>
                                                {cancelReasons.map((item) => <option key={item.id} value={item.code}>{item.label}</option>)}
                                            </select>
                                        </div>
                                        <div className="input-group">
                                            <label>Catatan Cancel</label>
                                            <textarea className="input-field" rows={3} value={resultForm.rejectedNote} onChange={(event) => setResultForm({ ...resultForm, rejectedNote: event.target.value })} disabled={!canUpdateResult} style={{ resize: 'vertical' }} />
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
                            <PickerTriggerField label="Tanggal" type="date" value={appt.date} onChange={(event) => setAppt({ ...appt, date: event.target.value })} required />
                            <PickerTriggerField label="Waktu" type="time" value={appt.time} onChange={(event) => setAppt({ ...appt, time: event.target.value })} required />
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
                                <select className="input-field" value={appt.status} onChange={(event) => setAppt({ ...appt, status: event.target.value })}>
                                    {APPOINTMENT_TAGS.map((tag) => <option key={tag.key} value={tag.key}>{tag.label}</option>)}
                                </select>
                            </div>
                            <button type="submit" className="btn btn-primary btn-full">Simpan Appointment</button>
                            <button type="button" className="btn btn-secondary btn-full" onClick={() => { setShowAppt(false); setEditingAppointment(null); }}>Batal</button>
                        </form>
                    </div>
                </div>
            ) : null}

            {showReassign && canAdminAssignOpenLead ? (
                <div className="sheet-overlay" onClick={(event) => { if (event.target === event.currentTarget) setShowReassign(false); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>Assign ke Sales</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <button
                                className={`btn ${!lead.assignedTo ? 'btn-primary' : 'btn-secondary'} btn-full`}
                                onClick={() => {
                                    void runLeadUpdate({ assignedTo: null }, 'Lead dikembalikan ke Open.');
                                    setShowReassign(false);
                                }}
                            >
                                Open (tanpa sales)
                            </button>
                            {salesUsers.map((sales) => (
                                <button
                                    key={sales.id}
                                    className={`btn ${sales.id === lead.assignedTo ? 'btn-primary' : 'btn-secondary'} btn-full`}
                                    onClick={() => {
                                        void runLeadUpdate({ assignedTo: sales.id }, `Lead berhasil di-assign ke ${sales.name}.`);
                                        setShowReassign(false);
                                    }}
                                >
                                    {sales.name} {sales.id === lead.assignedTo ? '✓' : ''}
                                </button>
                            ))}
                            <button className="btn btn-secondary btn-full" onClick={() => setShowReassign(false)} style={{ marginTop: 8 }}>
                                Batal
                            </button>
                        </div>
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
        </div>
    );
}
