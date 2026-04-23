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
} from '../constants/crm';
import { INDONESIA_CITIES } from '../constants/indonesiaCities';
import CustomerPipelineProgress from '../components/CustomerPipelineProgress';
import Header from '../components/Header';
import PickerTriggerField from '../components/PickerTriggerField';
import { apiRequest } from '../lib/api';

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
        addAppointment,
        updateAppointment,
        cancelAppointment,
        getSalesUsers,
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
    const [unitOptions, setUnitOptions] = useState([]);
    const [unitsLoading, setUnitsLoading] = useState(false);
    const [cancelReasons, setCancelReasons] = useState([]);
    const [cancelReasonsLoading, setCancelReasonsLoading] = useState(false);
    const lead = getLeadById(leadId);
    const salesUsers = getSalesUsers();

    const getSalesNameById = (salesId) => salesUsers.find((item) => item.id === salesId)?.name || 'Unassigned';
    const getCancelReasonLabel = (code) => {
        const matched = cancelReasons.find((item) => item.code === code);
        return matched?.label || getRejectedReasonLabel(code);
    };

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
            salesStatus: lead.salesStatus || 'warm',
            domicileCity: lead.domicileCity || '',
            interestUnitId: lead.interestUnitId || '',
        });
        setResultForm({
            resultStatus: lead.resultStatus || '',
            unitName: lead.unitName || '',
            unitDetail: lead.unitDetail || '',
            paymentMethod: lead.paymentMethod || '',
            rejectedReason: lead.rejectedReason || '',
            rejectedNote: lead.rejectedNote || '',
        });
    }, [lead]);

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
        } catch (err) {
            setRequestError(err instanceof Error ? err.message : 'Failed updating lead');
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
            }
            setAppt({ date: '', time: '', location: '', notes: '', status: 'mau_survey' });
            setEditingAppointment(null);
            setShowAppt(false);
            setRequestSuccess(
                editingAppointment?.id
                    ? 'Appointment berhasil diperbarui.'
                    : 'Appointment berhasil dibuat.'
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
            <div className="page-container">
                <Header
                    title="Detail Lead"
                    showBack
                    rightAction={(
                        <button className="btn btn-sm btn-secondary" onClick={() => void handleRefresh()} disabled={refreshing}>
                            {refreshing ? 'Loading...' : 'Refresh'}
                        </button>
                    )}
                />
                <div className="empty-state">
                    <div className="empty-icon">❌</div>
                    <div className="empty-title">Lead tidak ditemukan</div>
                </div>
            </div>
        );
    }

    const handleSaveFlow2 = async (event) => {
        event.preventDefault();
        if (!canEditLead) {
            return;
        }

        if (!canUpdateLayer2) {
            setRequestError('Data sales baru bisa diupdate setelah lead di-accept.');
            return;
        }

        if (!flow2Form.salesStatus) {
            setRequestError('Sales status wajib diisi.');
            return;
        }

        await runLeadUpdate({
            name: flow2Form.name,
            salesStatus: flow2Form.salesStatus,
            domicileCity: flow2Form.domicileCity || null,
            interestUnitId: flow2Form.interestUnitId || null,
            activityNote: 'Data sales lead diperbarui',
        });
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

        if (resultForm.resultStatus === 'cancel') {
            if (!resultForm.rejectedReason) {
                setRequestError('Alasan cancel wajib dipilih.');
                return;
            }

            if (!resultForm.rejectedNote.trim()) {
                setRequestError('Catatan cancel wajib diisi.');
                return;
            }

            await runLeadUpdate({
                resultStatus: 'cancel',
                rejectedReason: resultForm.rejectedReason,
                rejectedNote: resultForm.rejectedNote.trim(),
            }, 'Result status berhasil diubah ke Cancel. Status L2 otomatis menjadi Skip.');
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
        await runLeadUpdate({ activityNote: note.trim() }, 'Catatan berhasil ditambahkan.');
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
            setRequestSuccess('Appointment berhasil dibatalkan.');
        } catch (err) {
            setRequestError(err instanceof Error ? err.message : 'Failed cancelling appointment');
        }
    };

    return (
        <div className="page-container">
            <Header
                title="Detail Lead"
                showBack
                rightAction={(
                    <button className="btn btn-sm btn-secondary" onClick={() => void handleRefresh()} disabled={refreshing}>
                        {refreshing ? 'Loading...' : 'Refresh'}
                    </button>
                )}
            />

            <div className="card detail-info-card">
                <h2 className="detail-client-name">{lead.name}</h2>
                <div className="detail-info-row"><span>📱</span><span>{lead.phone}</span></div>
                <div className="detail-info-row"><span>📅</span><span>Masuk: {formatDate(lead.createdAt)}</span></div>
                <div className="detail-info-row"><span>📣</span><span>{lead.source}</span></div>
                <div className="detail-info-row"><span>🧭</span><span>Status Distribusi: {getFlowStatusLabel(effectiveFlowStatus)}</span></div>
                <div className="detail-info-row"><span>📌</span><span>Status Appointment: {getAppointmentTagLabel(appointmentTag)}</span></div>
                <div className="detail-info-row">
                    <span>👨‍💼</span>
                    <span>
                        Sales: {getSalesNameById(lead.assignedTo)}
                        {canAdminAssignOpenLead ? (
                            <button className="detail-reassign-btn" onClick={() => setShowReassign(true)}>
                                Ubah
                            </button>
                        ) : null}
                    </span>
                </div>
                {lead.acceptedAt ? (
                    <div className="detail-info-row"><span>✅</span><span>Lead diterima: {formatExactDateTime(lead.acceptedAt)}</span></div>
                ) : null}
                {requestError ? <div className="settings-error">{requestError}</div> : null}
                {requestSuccess ? <div className="settings-success">{requestSuccess}</div> : null}
                {needsNewLeadTaskAcceptance ? (
                    <div className="detail-pending-task-note">
                        <div className="settings-help" style={{ margin: '12px 0 0' }}>
                            Lead ini harus diterima lewat <strong>Tasks &gt; New Leads</strong>. Submit screenshot proof dan status L2 di sana untuk mengubah status lead menjadi Accepted.
                        </div>
                        <button
                            className="btn btn-primary btn-full"
                            style={{ marginTop: 12 }}
                            onClick={() => router.push('/daily-tasks')}
                        >
                            Buka Daily Task
                        </button>
                    </div>
                ) : null}
                <a href={toWaLink(lead.phone)} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp btn-full" style={{ marginTop: 12 }}>
                    Chat WhatsApp
                </a>
            </div>

            {isAcceptedLead ? (
                <div className="detail-section">
                    <div className="lead-row-top" style={{ alignItems: 'flex-start', marginBottom: 12 }}>
                        <div>
                            <h3 className="section-title" style={{ marginBottom: 4 }}>Customer Pipeline</h3>
                            <p className="settings-help" style={{ margin: 0 }}>
                                Follow up sekarang digerakkan otomatis dari Daily Task. Progress di bawah akan terisi saat proof day 4, day 8, dan day 12 berhasil disubmit.
                            </p>
                        </div>
                        <CustomerPipelineProgress
                            completed={customerPipelineRows.filter((item) => item.status === 'done').length}
                            total={customerPipelineRows.length}
                        />
                    </div>

                    <div className="card detail-pipeline-card">
                        {customerPipelineRows.map((step) => (
                            <div key={step.stepNo} className={`detail-pipeline-row ${step.status === 'done' ? 'is-completed' : ''}`}>
                                <div className="detail-pipeline-row-top">
                                    <div className="detail-pipeline-row-main">
                                        <div className="detail-pipeline-badges">
                                            <span className={`badge ${step.status === 'done' ? 'badge-success' : step.status === 'overdue' ? 'badge-danger' : step.status === 'pending' ? 'badge-warm' : 'badge-neutral'}`}>
                                                {step.label}
                                            </span>
                                            <span className={`badge ${step.status === 'done' ? 'badge-success' : step.status === 'overdue' ? 'badge-danger' : step.status === 'pending' ? 'badge-info' : 'badge-neutral'}`}>
                                                {step.status === 'done'
                                                    ? 'Done'
                                                    : step.status === 'overdue'
                                                        ? 'Overdue'
                                                        : step.status === 'pending'
                                                            ? 'Pending'
                                                            : 'Upcoming'}
                                            </span>
                                        </div>
                                        <div className="detail-pipeline-summary">
                                            {step.status === 'done'
                                                ? `Proof follow up sudah disubmit${step.completedAt ? ` pada ${formatExactDateTime(step.completedAt)}` : ''}.`
                                                : step.status === 'overdue'
                                                    ? `Milestone ini belum disubmit. Deadline ${formatExactDateTime(step.dueAt)}.`
                                                    : step.status === 'pending'
                                                        ? `Milestone aktif${step.dueAt ? ` dan perlu disubmit sebelum ${formatExactDateTime(step.dueAt)}` : ''}.`
                                                        : `Milestone akan aktif ${formatExactDateTime(step.eligibleAt)}.`}
                                        </div>
                                        {step.eligibleAt ? (
                                            <div className="detail-pipeline-meta">
                                                <span>Target follow up: {formatExactDateTime(step.eligibleAt)}</span>
                                                {step.dueAt ? <span>Deadline: {formatExactDateTime(step.dueAt)}</span> : null}
                                            </div>
                                        ) : null}
                                    </div>

                                    <div className="detail-pipeline-actions">
                                        {step.screenshotUrl ? (
                                            <a
                                                className="detail-pipeline-proof-link"
                                                href={step.screenshotUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <img
                                                    src={step.screenshotUrl}
                                                    alt={`${step.label} proof`}
                                                    className="detail-pipeline-proof-image"
                                                />
                                                <span className="btn btn-sm btn-secondary">Lihat Proof</span>
                                            </a>
                                        ) : (
                                            <span className="settings-help" style={{ margin: 0 }}>
                                                Submit lewat menu Daily Task
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            <div className="detail-section">
                <h3 className="section-title">Update Data Sales</h3>
                {isLockedByAkad ? (
                    <div className="detail-rejected-summary" style={{ marginBottom: 12, backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                        <strong>🔒 LEAD TERKUNCI</strong>: Lead ini telah mencapai status Akad dan datanya tidak dapat diubah lagi.
                    </div>
                ) : null}
                {!isAcceptedLead && !isLockedByAkad ? (
                    <div className="detail-rejected-summary" style={{ marginBottom: 12 }}>
                        {effectiveFlowStatus === 'assigned'
                            ? canEditLead
                                ? 'Lead sudah assigned ke kamu. Klik Accept dulu agar domisili, tipe unit, dan customer pipeline aktif.'
                                : 'Lead ini sudah assigned. Hanya sales owner yang bisa menerima dan mengupdate lead.'
                            : 'Lead masih open. Menunggu assignment ke sales sebelum bisa diproses lebih lanjut.'}
                    </div>
                ) : null}
                {!leadAllowsDelayedStatuses && isAcceptedLead ? (
                    <div className="settings-help" style={{ marginBottom: 12 }}>
                        Opsi <strong>Cold</strong> dan <strong>No Response</strong> baru terbuka setelah lead berumur lebih dari {SALES_STATUS_COLD_OPEN_DAYS} hari dari tanggal masuk.
                    </div>
                ) : null}
                <form onSubmit={handleSaveFlow2} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="input-group">
                        <label>Nama Lead</label>
                        <input
                            type="text"
                            className="input-field"
                            value={flow2Form.name}
                            onChange={(event) => setFlow2Form({ ...flow2Form, name: event.target.value })}
                            disabled={!canEditLead}
                        />
                    </div>
                    <div className="input-group">
                        <label>Sales Status</label>
                        <select
                            className="input-field"
                            value={flow2Form.salesStatus}
                            onChange={(event) => setFlow2Form({ ...flow2Form, salesStatus: event.target.value })}
                            disabled={!canEditLead || !canUpdateLayer2}
                        >
                            <option value="">Pilih status</option>
                            {visibleSalesStatuses.map((item) => (
                                <option key={item.key} value={item.key}>{item.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="input-group">
                        <label>Domisili</label>
                        <select
                            className="input-field"
                            value={flow2Form.domicileCity}
                            onChange={(event) => setFlow2Form({ ...flow2Form, domicileCity: event.target.value })}
                            disabled={!canEditLead || !canUpdateLayer2}
                        >
                            <option value="">Pilih kota</option>
                            {INDONESIA_CITIES.map((city) => (
                                <option key={city} value={city}>{city}</option>
                            ))}
                        </select>
                    </div>
                    <div className="input-group">
                        <label>Tipe Unit</label>
                        <select
                            className="input-field"
                            value={flow2Form.interestUnitId}
                            onChange={(event) => setFlow2Form({ ...flow2Form, interestUnitId: event.target.value })}
                            disabled={!canEditLead || !canUpdateLayer2 || unitsLoading}
                        >
                            <option value="">{unitsLoading ? 'Loading unit...' : 'Pilih tipe unit'}</option>
                            {unitOptions.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.projectType} - {item.unitName}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="lead-row-meta">
                        <span>Current L2: {lead.salesStatus ? getSalesStatusLabel(lead.salesStatus) : '-'}</span>
                        <span>Domisili: {lead.domicileCity || '-'}</span>
                        <span>Unit: {lead.interestProjectType && lead.interestUnitName ? `${lead.interestProjectType} - ${lead.interestUnitName}` : '-'}</span>
                    </div>
                    <button type="submit" className="btn btn-primary btn-full" disabled={!canEditLead || !canUpdateLayer2}>
                        {isAcceptedLead ? 'Simpan Data Sales' : 'Menunggu lead di-accept'}
                    </button>
                </form>
            </div>

            <div className="detail-section">
                <h3 className="section-title">Appointment</h3>
                <div className="detail-status-grid" style={{ marginBottom: 10 }}>
                    {APPOINTMENT_TAGS.map((tag) => (
                        <span
                            key={tag.key}
                            className={`badge ${appointmentTag === tag.key ? getStatusBadgeClass('appointment', tag.key) : 'badge-neutral'}`}
                        >
                            {tag.label}
                        </span>
                    ))}
                </div>
                {lead.appointments?.length > 0 ? (
                    <div>
                        {lead.appointments.map((item) => (
                            <div key={item.id} className="card detail-appt-card">
                                <div className="lead-row-top" style={{ marginBottom: 8 }}>
                                    <div className="detail-appt-date">🕐 {item.date} • {item.time}</div>
                                    <span className={`badge ${getStatusBadgeClass('appointment', item.status)}`}>
                                        {getAppointmentTagLabel(item.status || 'mau_survey')}
                                    </span>
                                </div>
                                <div className="detail-appt-location">📍 {item.location}</div>
                                {item.notes ? <div className="detail-appt-notes">{item.notes}</div> : null}
                                {canEditLead ? (
                                    <div className="detail-actions" style={{ marginTop: 12 }}>
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-full"
                                            onClick={() => openEditAppointment(item)}
                                        >
                                            Edit Appointment
                                        </button>
                                        {item.status !== 'dibatalkan' ? (
                                            <button
                                                type="button"
                                                className="btn btn-danger btn-full"
                                                onClick={() => void handleCancelAppointment(item)}
                                            >
                                                Batalkan
                                            </button>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="card">Belum ada appointment.</div>
                )}
                <button className="btn btn-primary btn-full" style={{ marginTop: 12 }} onClick={openCreateAppointment} disabled={!canEditLead}>
                    Buat Appointment
                </button>
            </div>

            <div className="detail-section">
                <h3 className="section-title">Status Hasil</h3>
                <div className="settings-help" style={{ marginBottom: 12 }}>
                    Result status sekarang bisa diupdate langsung tanpa harus menunggu layer sebelumnya lengkap, selama field wajib untuk status tersebut terpenuhi.
                </div>
                <form onSubmit={handleSaveResult} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="input-group">
                        <label>Result Status</label>
                        <select
                            className="input-field"
                            value={resultForm.resultStatus}
                            onChange={(event) => setResultForm({ ...resultForm, resultStatus: event.target.value })}
                            disabled={!canUpdateResult}
                        >
                            <option value="">Pilih status</option>
                            {RESULT_STATUSES.map((item) => (
                                <option key={item.key} value={item.key}>{item.label}</option>
                            ))}
                        </select>
                    </div>

                    {resultForm.resultStatus === 'akad' ? (
                        <>
                            <div className="input-group">
                                <label>Nama Unit</label>
                                <input
                                    className="input-field"
                                    value={resultForm.unitName}
                                    onChange={(event) => setResultForm({ ...resultForm, unitName: event.target.value })}
                                    disabled={!canUpdateResult}
                                />
                            </div>
                            <div className="input-group">
                                <label>Detail Unit</label>
                                <textarea
                                    className="input-field"
                                    rows={3}
                                    value={resultForm.unitDetail}
                                    onChange={(event) => setResultForm({ ...resultForm, unitDetail: event.target.value })}
                                    disabled={!canUpdateResult}
                                    style={{ resize: 'vertical' }}
                                />
                            </div>
                            <div className="input-group">
                                <label>Cara Bayar</label>
                                <input
                                    className="input-field"
                                    value={resultForm.paymentMethod}
                                    onChange={(event) => setResultForm({ ...resultForm, paymentMethod: event.target.value })}
                                    disabled={!canUpdateResult}
                                />
                            </div>
                        </>
                    ) : null}

                    {resultForm.resultStatus === 'cancel' ? (
                        <>
                            <div className="input-group">
                                <label>Alasan Cancel</label>
                                <select
                                    className="input-field"
                                    value={resultForm.rejectedReason}
                                    onChange={(event) => setResultForm({ ...resultForm, rejectedReason: event.target.value })}
                                    disabled={!canUpdateResult || cancelReasonsLoading}
                                >
                                    <option value="">{cancelReasonsLoading ? 'Loading alasan...' : 'Pilih alasan cancel'}</option>
                                    {cancelReasons.map((item) => (
                                        <option key={item.id} value={item.code}>{item.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="input-group">
                                <label>Catatan Cancel</label>
                                <textarea
                                    className="input-field"
                                    rows={3}
                                    value={resultForm.rejectedNote}
                                    onChange={(event) => setResultForm({ ...resultForm, rejectedNote: event.target.value })}
                                    disabled={!canUpdateResult}
                                    style={{ resize: 'vertical' }}
                                />
                            </div>
                        </>
                    ) : null}

                    <div className="lead-row-meta">
                        <span>Current Result: {lead.resultStatus ? getResultStatusLabel(lead.resultStatus) : '-'}</span>
                        {lead.resultStatus === 'cancel' ? <span>Reason: {getCancelReasonLabel(lead.rejectedReason)}</span> : null}
                    </div>

                    <button type="submit" className="btn btn-primary btn-full" disabled={!canUpdateResult}>
                        Simpan Result Status
                    </button>
                </form>
            </div>

            <div className="detail-section">
                <h3 className="section-title">Riwayat Aktivitas</h3>
                <div className="card">
                    <div className="activity-list">
                        {(lead.activities || []).map((item) => (
                            <div key={item.id} className="activity-item">
                                <div className="activity-icon" style={{ background: 'rgba(148,163,184,0.12)' }}>📝</div>
                                <div className="activity-content">
                                    <div className="activity-title">{item.note}</div>
                                    <div className="activity-time">{getTimeAgo(item.timestamp)}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="detail-actions">
                <button className="btn btn-secondary btn-full" onClick={() => setShowNote(true)} disabled={!canEditLead}>Tambah Catatan</button>
                <button className="btn btn-primary btn-full" onClick={openCreateAppointment} disabled={!canEditLead}>Buat Appointment</button>
            </div>

            {showNote ? (
                <div className="modal-overlay" onClick={(event) => { if (event.target === event.currentTarget) setShowNote(false); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>Tambah Catatan</h2>
                        <form onSubmit={handleAddNote} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div className="input-group">
                                <label>Catatan</label>
                                <textarea
                                    className="input-field"
                                    placeholder="Tulis catatan aktivitas..."
                                    rows={4}
                                    value={note}
                                    onChange={(event) => setNote(event.target.value)}
                                    required
                                    style={{ resize: 'vertical' }}
                                />
                            </div>
                            <button type="submit" className="btn btn-primary btn-full">Simpan</button>
                            <button type="button" className="btn btn-secondary btn-full" onClick={() => setShowNote(false)}>Batal</button>
                        </form>
                    </div>
                </div>
            ) : null}

            {showAppt ? (
                <div className="modal-overlay" onClick={(event) => {
                    if (event.target === event.currentTarget) {
                        setShowAppt(false);
                        setEditingAppointment(null);
                    }
                }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>{editingAppointment ? 'Edit Appointment' : 'Buat Appointment'}</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: 16 }}>
                            Client: <strong>{lead.name}</strong>
                        </p>
                        <form onSubmit={handleAddAppt} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <PickerTriggerField
                                label="Tanggal"
                                type="date"
                                value={appt.date}
                                onChange={(event) => setAppt({ ...appt, date: event.target.value })}
                                required
                            />
                            <PickerTriggerField
                                label="Waktu"
                                type="time"
                                value={appt.time}
                                onChange={(event) => setAppt({ ...appt, time: event.target.value })}
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
                            {editingAppointment ? (
                                <div className="input-group">
                                    <label>Status Appointment</label>
                                    <select className="input-field" value={appt.status} onChange={(event) => setAppt({ ...appt, status: event.target.value })}>
                                        {APPOINTMENT_TAGS.map((tag) => (
                                            <option key={tag.key} value={tag.key}>{tag.label}</option>
                                        ))}
                                    </select>
                                </div>
                            ) : null}
                            <button type="submit" className="btn btn-primary btn-full">
                                {editingAppointment ? 'Simpan Appointment' : 'Buat Jadwal'}
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary btn-full"
                                onClick={() => {
                                    setShowAppt(false);
                                    setEditingAppointment(null);
                                }}
                            >
                                Batal
                            </button>
                        </form>
                    </div>
                </div>
            ) : null}

            {showReassign && canAdminAssignOpenLead ? (
                <div className="modal-overlay" onClick={(event) => { if (event.target === event.currentTarget) setShowReassign(false); }}>
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
        </div>
    );
}
