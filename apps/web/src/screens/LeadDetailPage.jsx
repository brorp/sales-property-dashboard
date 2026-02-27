'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import {
    APPOINTMENT_TAGS,
    RESULT_STATUSES,
    REJECTED_REASON_OPTIONS,
    SALES_STATUSES,
    getAppointmentTagLabel,
    getFlowStatusLabel,
    getRejectedReasonLabel,
    getResultStatusLabel,
    getSalesStatusLabel,
    getTimeAgo,
    formatDate,
    toWaLink,
} from '../constants/crm';
import { INDONESIA_CITIES } from '../constants/indonesiaCities';
import Header from '../components/Header';

export default function LeadDetailPage({ leadId }) {
    const { user, isAdmin } = useAuth();
    const { getLeadById, loadLeadById, updateLead, addAppointment, getSalesUsers } = useLeads();

    const [showAppt, setShowAppt] = useState(false);
    const [showNote, setShowNote] = useState(false);
    const [showReassign, setShowReassign] = useState(false);
    const [note, setNote] = useState('');
    const [appt, setAppt] = useState({ date: '', time: '', location: '', notes: '' });

    const [flow2Form, setFlow2Form] = useState({
        name: '',
        salesStatus: '',
        domicileCity: '',
    });

    const [resultForm, setResultForm] = useState({
        resultStatus: '',
        unitName: '',
        unitDetail: '',
        paymentMethod: '',
        rejectedReason: 'harga',
        rejectedNote: '',
    });

    const [requestError, setRequestError] = useState('');
    const [requestSuccess, setRequestSuccess] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    const lead = getLeadById(leadId);
    const salesUsers = getSalesUsers();
    const getSalesNameById = (salesId) => salesUsers.find((item) => item.id === salesId)?.name || 'Unassigned';

    useEffect(() => {
        if (!leadId) return;
        void loadLeadById(leadId);
    }, [leadId, loadLeadById]);

    useEffect(() => {
        if (!lead) return;
        setFlow2Form({
            name: lead.name || '',
            salesStatus: lead.salesStatus || '',
            domicileCity: lead.domicileCity || '',
        });
        setResultForm({
            resultStatus: lead.resultStatus || '',
            unitName: lead.unitName || '',
            unitDetail: lead.unitDetail || '',
            paymentMethod: lead.paymentMethod || '',
            rejectedReason: lead.rejectedReason || 'harga',
            rejectedNote: lead.rejectedNote || '',
        });
    }, [lead]);

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

    const runLeadUpdate = async (payload) => {
        try {
            setRequestError('');
            setRequestSuccess('');
            await updateLead(lead.id, payload);
            setRequestSuccess('Update berhasil disimpan.');
        } catch (err) {
            setRequestError(err instanceof Error ? err.message : 'Failed updating lead');
        }
    };

    const runAddAppointment = async (payload) => {
        try {
            setRequestError('');
            setRequestSuccess('');
            await addAppointment(lead.id, payload);
            setAppt({ date: '', time: '', location: '', notes: '' });
            setShowAppt(false);
            setRequestSuccess('Appointment berhasil dibuat.');
        } catch (err) {
            setRequestError(err instanceof Error ? err.message : 'Failed adding appointment');
        }
    };

    const handleRefresh = async () => {
        if (!leadId) {
            return;
        }
        setRefreshing(true);
        try {
            await loadLeadById(leadId);
        } finally {
            setRefreshing(false);
        }
    };

    if (!lead) return (
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
            <div className="empty-state"><div className="empty-icon">❌</div><div className="empty-title">Lead tidak ditemukan</div></div>
        </div>
    );

    const appointmentTag = lead.appointmentTag || 'none';
    const canUpdateResult = appointmentTag === 'sudah_survey';
    const effectiveFlowStatus =
        lead.flowStatus === 'open' && lead.assignedTo ? 'assigned' : lead.flowStatus;

    const handleSaveFlow2 = async (e) => {
        e.preventDefault();
        if (!canEditLead) return;

        if (effectiveFlowStatus !== 'assigned') {
            setRequestError('Data sales hanya bisa diupdate saat lead sudah assigned.');
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
            activityNote: 'Data sales lead diupdate',
        });
    };

    const handleSaveResult = async (e) => {
        e.preventDefault();
        if (!canEditLead) return;

        if (!resultForm.resultStatus) {
            setRequestError('Result status wajib dipilih.');
            return;
        }

        if (!canUpdateResult) {
            setRequestError('Result status hanya bisa diupdate setelah appointment menjadi sudah survey.');
            return;
        }

        if (resultForm.resultStatus === 'closing') {
            if (!resultForm.unitName || !resultForm.unitDetail || !resultForm.paymentMethod) {
                setRequestError('Untuk status closing, unit name/detail/payment method wajib diisi.');
                return;
            }
            await runLeadUpdate({
                resultStatus: 'closing',
                unitName: resultForm.unitName,
                unitDetail: resultForm.unitDetail,
                paymentMethod: resultForm.paymentMethod,
                activityNote: 'Result status diubah ke closing',
            });
            return;
        }

        if (resultForm.resultStatus === 'batal') {
            if (!resultForm.rejectedReason) {
                setRequestError('Alasan batal wajib diisi.');
                return;
            }
            await runLeadUpdate({
                resultStatus: 'batal',
                rejectedReason: resultForm.rejectedReason,
                rejectedNote: resultForm.rejectedNote || null,
                activityNote: `Result status diubah ke batal (${getRejectedReasonLabel(resultForm.rejectedReason)})`,
            });
            return;
        }

        await runLeadUpdate({
            resultStatus: 'menunggu',
            activityNote: 'Result status diubah ke menunggu',
        });
    };

    const handleAddNote = async (e) => {
        e.preventDefault();
        if (!note.trim()) return;
        await runLeadUpdate({ activityNote: note });
        setNote('');
        setShowNote(false);
    };

    const handleAddAppt = async (e) => {
        e.preventDefault();
        if (!appt.date || !appt.time || !appt.location) return;
        await runAddAppointment(appt);
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
                    <span>Sales: {getSalesNameById(lead.assignedTo)}
                        {canAdminAssignOpenLead && <button className="detail-reassign-btn" onClick={() => setShowReassign(true)}>Ubah</button>}
                    </span>
                </div>
                {requestError ? <div className="settings-error">{requestError}</div> : null}
                {requestSuccess ? <div className="settings-success">{requestSuccess}</div> : null}
                <a href={toWaLink(lead.phone)} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp btn-full" style={{ marginTop: 12 }}>Chat WhatsApp</a>
            </div>

            <div className="detail-section">
                <h3 className="section-title">Update Data Sales</h3>
                {effectiveFlowStatus !== 'assigned' ? (
                    <div className="detail-rejected-summary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <span>Lead masih open. Menunggu sales claim OK agar status menjadi assigned.</span>
                        {canAdminAssignOpenLead ? (
                            <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                onClick={() => setShowReassign(true)}
                            >
                                Assign Sekarang
                            </button>
                        ) : null}
                    </div>
                ) : null}
                {isAdmin && effectiveFlowStatus === 'assigned' ? (
                    <div className="detail-rejected-summary" style={{ marginBottom: 12 }}>
                        Lead ini sudah assigned. Admin hanya bisa view, update data hanya oleh sales owner.
                    </div>
                ) : null}
                <form onSubmit={handleSaveFlow2} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="input-group">
                        <label>Nama Lead (opsional update)</label>
                        <input
                            type="text"
                            className="input-field"
                            value={flow2Form.name}
                            onChange={(e) => setFlow2Form({ ...flow2Form, name: e.target.value })}
                            disabled={!canEditLead}
                        />
                    </div>
                    <div className="input-group">
                        <label>Sales Status</label>
                        <select
                            className="input-field"
                            value={flow2Form.salesStatus}
                            onChange={(e) => setFlow2Form({ ...flow2Form, salesStatus: e.target.value })}
                            disabled={!canEditLead || effectiveFlowStatus !== 'assigned'}
                        >
                            <option value="">Pilih status</option>
                            {SALES_STATUSES.map((item) => (
                                <option key={item.key} value={item.key}>{item.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="input-group">
                        <label>Domisili</label>
                        <select
                            className="input-field"
                            value={flow2Form.domicileCity}
                            onChange={(e) => setFlow2Form({ ...flow2Form, domicileCity: e.target.value })}
                            disabled={!canEditLead || effectiveFlowStatus !== 'assigned'}
                        >
                            <option value="">Pilih kota</option>
                            {INDONESIA_CITIES.map((city) => (
                                <option key={city} value={city}>{city}</option>
                            ))}
                        </select>
                    </div>
                    <div className="lead-row-meta">
                        <span>Current: {lead.salesStatus ? getSalesStatusLabel(lead.salesStatus) : '-'}</span>
                        <span>Domisili: {lead.domicileCity || '-'}</span>
                    </div>
                    <button type="submit" className="btn btn-primary btn-full" disabled={!canEditLead || effectiveFlowStatus !== 'assigned'}>
                        {effectiveFlowStatus === 'assigned' ? 'Simpan Data Sales' : 'Menunggu lead assigned'}
                    </button>
                </form>
            </div>

            <div className="detail-section">
                <h3 className="section-title">Appointment</h3>
                <div className="detail-status-grid" style={{ marginBottom: 10 }}>
                    {APPOINTMENT_TAGS.map((tag) => (
                        <span
                            key={tag.key}
                            className={`badge ${appointmentTag === tag.key ? 'badge-success' : 'badge-neutral'}`}
                        >
                            {tag.label}
                        </span>
                    ))}
                </div>
                {lead.appointments?.length > 0 ? (
                    <div>
                        {lead.appointments.map((item) => (
                            <div key={item.id} className="card detail-appt-card">
                                <div className="detail-appt-date">🕐 {item.date} • {item.time}</div>
                                <div className="detail-appt-location">📍 {item.location}</div>
                                {item.notes ? <div className="detail-appt-notes">{item.notes}</div> : null}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="card">Belum ada appointment.</div>
                )}
                <button className="btn btn-primary btn-full" style={{ marginTop: 12 }} onClick={() => setShowAppt(true)} disabled={!canEditLead}>
                    Buat Appointment
                </button>
            </div>

            <div className="detail-section">
                <h3 className="section-title">Status Hasil</h3>
                {!canUpdateResult ? (
                    <div className="detail-rejected-summary">
                        Result status hanya bisa diupdate jika appointment tag sudah <strong>sudah survey</strong>.
                    </div>
                ) : null}
                <form onSubmit={handleSaveResult} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="input-group">
                        <label>Result Status</label>
                        <select
                            className="input-field"
                            value={resultForm.resultStatus}
                            onChange={(e) => setResultForm({ ...resultForm, resultStatus: e.target.value })}
                            disabled={!canEditLead || !canUpdateResult}
                        >
                            <option value="">Pilih status</option>
                            {RESULT_STATUSES.map((item) => (
                                <option key={item.key} value={item.key}>{item.label}</option>
                            ))}
                        </select>
                    </div>

                    {resultForm.resultStatus === 'closing' ? (
                        <>
                            <div className="input-group">
                                <label>Nama Unit</label>
                                <input className="input-field" value={resultForm.unitName} onChange={(e) => setResultForm({ ...resultForm, unitName: e.target.value })} disabled={!canEditLead || !canUpdateResult} />
                            </div>
                            <div className="input-group">
                                <label>Detail Unit</label>
                                <textarea className="input-field" rows={3} value={resultForm.unitDetail} onChange={(e) => setResultForm({ ...resultForm, unitDetail: e.target.value })} disabled={!canEditLead || !canUpdateResult} />
                            </div>
                            <div className="input-group">
                                <label>Cara Bayar</label>
                                <input className="input-field" value={resultForm.paymentMethod} onChange={(e) => setResultForm({ ...resultForm, paymentMethod: e.target.value })} disabled={!canEditLead || !canUpdateResult} />
                            </div>
                        </>
                    ) : null}

                    {resultForm.resultStatus === 'batal' ? (
                        <>
                            <div className="input-group">
                                <label>Kategori Reject</label>
                                <select className="input-field" value={resultForm.rejectedReason} onChange={(e) => setResultForm({ ...resultForm, rejectedReason: e.target.value })} disabled={!canEditLead || !canUpdateResult}>
                                    {REJECTED_REASON_OPTIONS.map((item) => (
                                        <option key={item.key} value={item.key}>{item.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="input-group">
                                <label>Notes</label>
                                <textarea className="input-field" rows={3} value={resultForm.rejectedNote} onChange={(e) => setResultForm({ ...resultForm, rejectedNote: e.target.value })} disabled={!canEditLead || !canUpdateResult} />
                            </div>
                        </>
                    ) : null}

                    <div className="lead-row-meta">
                        <span>Current: {lead.resultStatus ? getResultStatusLabel(lead.resultStatus) : '-'}</span>
                        {lead.resultStatus === 'batal' ? <span>Reason: {getRejectedReasonLabel(lead.rejectedReason)}</span> : null}
                    </div>

                    <button type="submit" className="btn btn-primary btn-full" disabled={!canEditLead || !canUpdateResult}>
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
                <button className="btn btn-primary btn-full" onClick={() => setShowAppt(true)} disabled={!canEditLead}>Buat Appointment</button>
            </div>

            {showNote && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowNote(false); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>Tambah Catatan</h2>
                        <form onSubmit={handleAddNote} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div className="input-group"><label>Catatan</label>
                                <textarea className="input-field" placeholder="Tulis catatan aktivitas..." rows={4} value={note} onChange={(e) => setNote(e.target.value)} required style={{ resize: 'vertical' }} />
                            </div>
                            <button type="submit" className="btn btn-primary btn-full">Simpan</button>
                            <button type="button" className="btn btn-secondary btn-full" onClick={() => setShowNote(false)}>Batal</button>
                        </form>
                    </div>
                </div>
            )}

            {showAppt && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAppt(false); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>Buat Appointment</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: 16 }}>Client: <strong>{lead.name}</strong></p>
                        <form onSubmit={handleAddAppt} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div className="input-group"><label>Tanggal</label><input type="date" className="input-field" value={appt.date} onChange={(e) => setAppt({ ...appt, date: e.target.value })} required /></div>
                            <div className="input-group"><label>Waktu</label><input type="time" className="input-field" value={appt.time} onChange={(e) => setAppt({ ...appt, time: e.target.value })} required /></div>
                            <div className="input-group"><label>Lokasi</label><input type="text" className="input-field" placeholder="Contoh: BSD City, Tangerang" value={appt.location} onChange={(e) => setAppt({ ...appt, location: e.target.value })} required /></div>
                            <div className="input-group"><label>Catatan</label><textarea className="input-field" placeholder="Catatan tambahan..." rows={3} value={appt.notes} onChange={(e) => setAppt({ ...appt, notes: e.target.value })} style={{ resize: 'vertical' }} /></div>
                            <button type="submit" className="btn btn-primary btn-full">Buat Jadwal</button>
                            <button type="button" className="btn btn-secondary btn-full" onClick={() => setShowAppt(false)}>Batal</button>
                        </form>
                    </div>
                </div>
            )}

            {showReassign && canAdminAssignOpenLead && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowReassign(false); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>Assign ke Sales</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <button className={`btn ${!lead.assignedTo ? 'btn-primary' : 'btn-secondary'} btn-full`} onClick={() => { void runLeadUpdate({ assignedTo: null, activityNote: 'Admin melepas assignment lead' }); setShowReassign(false); }}>
                                Open (tanpa sales)
                            </button>
                            {salesUsers.map((sales) => (
                                <button
                                    key={sales.id}
                                    className={`btn ${sales.id === lead.assignedTo ? 'btn-primary' : 'btn-secondary'} btn-full`}
                                    onClick={() => {
                                        void runLeadUpdate({ assignedTo: sales.id, activityNote: `Admin assign lead ke ${sales.name}` });
                                        setShowReassign(false);
                                    }}
                                >
                                    {sales.name} {sales.id === lead.assignedTo ? '✓' : ''}
                                </button>
                            ))}
                            <button className="btn btn-secondary btn-full" onClick={() => setShowReassign(false)} style={{ marginTop: 8 }}>Batal</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
