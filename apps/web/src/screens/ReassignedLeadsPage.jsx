'use client';

import { useMemo, useState } from 'react';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import { getFlowStatusLabel, getSalesStatusLabel, getStatusBadgeClass } from '../constants/crm';

function formatDateTime(value) {
    if (!value) {
        return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '-';
    }

    return date.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function leadMatchesSearch(lead, search) {
    const q = String(search || '').trim().toLowerCase();
    if (!q) {
        return true;
    }

    return [
        lead.name,
        lead.phone,
        lead.source,
        lead.assignedUserName,
        lead.salesStatus,
        lead.resultStatus,
    ].some((value) => String(value || '').toLowerCase().includes(q));
}

export default function ReassignedLeadsPage() {
    const { user } = useAuth();
    const {
        leads,
        getSalesUsers,
        reassignLead,
        refreshLeads,
        refreshSalesUsers,
    } = useLeads();
    const [search, setSearch] = useState('');
    const [selectedLeadId, setSelectedLeadId] = useState('');
    const [targetSalesId, setTargetSalesId] = useState('');
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [feedback, setFeedback] = useState('');
    const [error, setError] = useState('');

    const salesUsers = getSalesUsers();
    const assignedLeads = useMemo(
        () => leads
            .filter((lead) => Boolean(lead.assignedTo))
            .filter((lead) => leadMatchesSearch(lead, search)),
        [leads, search]
    );
    const selectedLead = useMemo(
        () => leads.find((lead) => lead.id === selectedLeadId) || assignedLeads[0] || null,
        [assignedLeads, leads, selectedLeadId]
    );
    const availableSales = useMemo(
        () => salesUsers.filter((sales) => sales.id !== selectedLead?.assignedTo),
        [salesUsers, selectedLead?.assignedTo]
    );

    const activeLeadId = selectedLead?.id || '';
    const effectiveTargetSalesId = targetSalesId && availableSales.some((sales) => sales.id === targetSalesId)
        ? targetSalesId
        : '';

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!selectedLead) {
            setError('Pilih lead yang ingin dipindahkan.');
            return;
        }
        if (!effectiveTargetSalesId) {
            setError('Pilih sales tujuan yang berbeda dari sales saat ini.');
            return;
        }
        if (!note.trim()) {
            setError('Catatan emergency wajib diisi agar audit jelas.');
            return;
        }

        setSubmitting(true);
        setError('');
        setFeedback('');
        try {
            const result = await reassignLead(selectedLead.id, {
                targetSalesId: effectiveTargetSalesId,
                note: note.trim(),
            });
            setFeedback(`Lead berhasil direassign ke ${result?.toSalesName || 'sales baru'}. Task New Lead sudah dipindahkan.`);
            setSelectedLeadId('');
            setTargetSalesId('');
            setNote('');
            await Promise.all([refreshLeads(), refreshSalesUsers()]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal melakukan reassign lead');
        } finally {
            setSubmitting(false);
        }
    };

    if (user?.role !== 'client_admin' && user?.role !== 'root_admin') {
        return (
            <div className="page-container">
                <Header title="Reassigned Leads" />
                <div className="card empty-state">
                    <div className="empty-icon">🔒</div>
                    <div className="empty-title">Khusus admin</div>
                    <div className="empty-desc">Fitur emergency reassign hanya tersedia untuk admin.</div>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <Header title="Reassigned Leads" />

            <section className="card settings-card">
                <div className="settings-header">
                    <div>
                        <h2>Emergency Lead Reassign</h2>
                        <p className="settings-meta">
                            Pindahkan owner lead yang sudah assigned ke sales lain. Lead akan kembali ke status Assigned dan muncul di Daily Task sales tujuan.
                        </p>
                    </div>
                    <span className="badge badge-danger">Admin Only</span>
                </div>
                <div className="settings-live-offer">
                    Gunakan hanya untuk case koreksi assignment. Semua perubahan masuk audit log dan appointment owner ikut disinkronkan.
                </div>
            </section>

            <section className="settings-inline-grid reassign-layout">
                <div className="card settings-card">
                    <div className="settings-header">
                        <div>
                            <h3>Pilih Lead</h3>
                            <p className="settings-meta">{assignedLeads.length} lead assigned di workspace aktif</p>
                        </div>
                    </div>
                    <input
                        className="input-field"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Cari nama, nomor, source, sales..."
                    />
                    <div className="settings-queue-list reassign-lead-list">
                        {assignedLeads.length === 0 ? (
                            <div className="empty-state reassign-empty">
                                <div className="empty-title">Tidak ada lead assigned</div>
                                <div className="empty-desc">Coba ubah keyword pencarian atau workspace.</div>
                            </div>
                        ) : assignedLeads.map((lead) => (
                            <button
                                key={lead.id}
                                type="button"
                                className={`settings-queue-item reassign-lead-item ${activeLeadId === lead.id ? 'is-selected' : ''}`}
                                onClick={() => {
                                    setSelectedLeadId(lead.id);
                                    setTargetSalesId('');
                                    setFeedback('');
                                    setError('');
                                }}
                            >
                                <div className="settings-queue-main">
                                    <span className="settings-queue-order">{String(lead.name || '?').charAt(0).toUpperCase()}</span>
                                    <div>
                                        <div className="settings-queue-name">{lead.name}</div>
                                        <div className="settings-queue-meta">
                                            {lead.phone} • {lead.source || '-'} • Sales: {lead.assignedUserName || '-'}
                                        </div>
                                        <div className="reassign-badges">
                                            <span className={`badge ${getStatusBadgeClass('flow', lead.flowStatus)}`}>
                                                {getFlowStatusLabel(lead.flowStatus)}
                                            </span>
                                            {lead.salesStatus ? (
                                                <span className={`badge ${getStatusBadgeClass('sales', lead.salesStatus)}`}>
                                                    {getSalesStatusLabel(lead.salesStatus)}
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                <form className="card settings-card" onSubmit={handleSubmit}>
                    <div className="settings-header">
                        <div>
                            <h3>Sales Tujuan</h3>
                            <p className="settings-meta">Pilih owner baru dan isi alasan emergency.</p>
                        </div>
                    </div>

                    {selectedLead ? (
                        <div className="reassign-summary">
                            <div>
                                <span className="settings-queue-meta">Lead</span>
                                <strong>{selectedLead.name}</strong>
                            </div>
                            <div>
                                <span className="settings-queue-meta">Sales sekarang</span>
                                <strong>{selectedLead.assignedUserName || '-'}</strong>
                            </div>
                            <div>
                                <span className="settings-queue-meta">Update terakhir</span>
                                <strong>{formatDateTime(selectedLead.updatedAt)}</strong>
                            </div>
                        </div>
                    ) : (
                        <div className="settings-live-offer">Pilih lead dari daftar untuk mulai reassign.</div>
                    )}

                    <label className="form-group">
                        <span>Sales tujuan</span>
                        <select
                            className="input-field"
                            value={effectiveTargetSalesId}
                            onChange={(event) => setTargetSalesId(event.target.value)}
                            disabled={!selectedLead || submitting}
                        >
                            <option value="">Pilih sales</option>
                            {availableSales.map((sales) => (
                                <option key={sales.id} value={sales.id}>
                                    {sales.name} {sales.isSuspended ? '(suspended)' : ''}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="form-group">
                        <span>Catatan emergency</span>
                        <textarea
                            className="input-field"
                            rows={4}
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder="Contoh: salah assign, sales cuti, atau koreksi ownership."
                            disabled={!selectedLead || submitting}
                        />
                    </label>

                    {error ? <div className="settings-error">{error}</div> : null}
                    {feedback ? <div className="settings-success">{feedback}</div> : null}

                    <button
                        type="submit"
                        className="btn btn-primary btn-full"
                        disabled={!selectedLead || !effectiveTargetSalesId || submitting}
                    >
                        {submitting ? 'Memindahkan...' : 'Reassign Lead'}
                    </button>
                </form>
            </section>
        </div>
    );
}
