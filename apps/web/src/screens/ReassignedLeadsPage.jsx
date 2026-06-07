'use client';

import { useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';
import Select from '../components/Select';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import { getFlowStatusLabel, getSalesStatusLabel, getStatusBadgeClass } from '../constants/crm';
import './SettingsPage.css';

function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function leadMatchesSearch(lead, search) {
    const q = String(search || '').trim().toLowerCase();
    if (!q) return true;
    return [lead.name, lead.phone, lead.source, lead.assignedUserName, lead.salesStatus, lead.resultStatus]
        .some((value) => String(value || '').toLowerCase().includes(q));
}

export default function ReassignedLeadsPage() {
    const { user } = useAuth();
    const { leads, getSalesUsers, reassignLead, refreshLeads, refreshSalesUsers } = useLeads();
    const [search, setSearch] = useState('');
    const [selectedLeadId, setSelectedLeadId] = useState('');
    const [targetSalesId, setTargetSalesId] = useState('');
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [feedback, setFeedback] = useState('');
    const [error, setError] = useState('');

    const salesUsers = getSalesUsers();
    const assignedLeads = useMemo(
        () => leads.filter((lead) => Boolean(lead.assignedTo)).filter((lead) => leadMatchesSearch(lead, search)),
        [leads, search]
    );
    const selectedLead = useMemo(
        () => leads.find((lead) => lead.id === selectedLeadId) || assignedLeads[0] || null,
        [assignedLeads, leads, selectedLeadId]
    );
    const availableSales = useMemo(
        () => salesUsers.filter((sales) => sales.isActive !== false && sales.id !== selectedLead?.assignedTo),
        [salesUsers, selectedLead?.assignedTo]
    );

    const activeLeadId = selectedLead?.id || '';
    const effectiveTargetSalesId = targetSalesId && availableSales.some((sales) => sales.id === targetSalesId) ? targetSalesId : '';

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!selectedLead) { setError('Pilih lead yang ingin dipindahkan.'); return; }
        if (!effectiveTargetSalesId) { setError('Pilih sales tujuan yang berbeda dari sales saat ini.'); return; }
        if (!note.trim()) { setError('Catatan emergency wajib diisi agar audit jelas.'); return; }

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
            <div className="page-container set-page">
                <Header title="Leads Dialihkan" showBack/>
                <div className="set-card" style={{ textAlign: 'center', padding: '32px 16px' }}>
                    <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔒</div>
                    <div style={{ fontWeight: 600, color: '#1E3A5F', marginBottom: 4 }}>Khusus admin</div>
                    <div style={{ fontSize: '0.875rem', color: '#6B7280' }}>Fitur emergency reassign hanya tersedia untuk admin.</div>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container set-page">
            <Header title="Reassigned Leads" showBack/>

            <section className="set-card">
                <div className="settings-header">
                    <div>
                        <h2 style={{ margin: '0 0 4px', fontSize: '1rem', color: '#1E3A5F' }}>Alih Leads Darurat</h2>
                        <p className="settings-help" style={{ marginTop: 0 }}>
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
                <div className="set-card">
                    <div className="settings-header">
                        <div>
                            <h3 style={{ margin: '0 0 2px', fontSize: '0.9375rem', color: '#1E3A5F' }}>Pilih Lead</h3>
                            <p className="settings-help" style={{ marginTop: 0 }}>{assignedLeads.length} lead assigned di workspace aktif</p>
                        </div>
                    </div>
                    <input
                        className="input-field"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Cari nama, nomor, source, sales..."
                    />
                    <div className="settings-queue-list reassign-lead-list">
                        {assignedLeads.length === 0 ? (
                            <div className="reassign-empty" style={{ padding: '24px 12px', textAlign: 'center' }}>
                                <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4 }}>Tidak ada lead assigned</div>
                                <div style={{ fontSize: '0.875rem', color: '#6B7280' }}>Coba ubah keyword pencarian atau workspace.</div>
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

                <form className="set-card" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="settings-header">
                        <div>
                            <h3 style={{ margin: '0 0 2px', fontSize: '0.9375rem', color: '#1E3A5F' }}>Sales Tujuan</h3>
                            <p className="settings-help" style={{ marginTop: 0 }}>Pilih owner baru dan isi alasan emergency.</p>
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

                    <div className="input-group">
                        <label>Sales tujuan</label>
                        <Select
                            options={availableSales.map((s) => ({
                                value: s.id,
                                label: s.name + (s.isSuspended ? ' (suspended)' : ''),
                            }))}
                            value={effectiveTargetSalesId}
                            onChange={(val) => setTargetSalesId(val)}
                            placeholder="Pilih sales"
                            clearable={false}
                            disabled={!selectedLead || submitting}
                            variant="white"
                        />
                    </div>

                    <div className="input-group">
                        <label>Catatan emergency</label>
                        <textarea
                            className="input-field"
                            rows={4}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Contoh: salah assign, sales cuti, atau koreksi ownership."
                            disabled={!selectedLead || submitting}
                        />
                    </div>

                    {error ? <p className="settings-error">{error}</p> : null}
                    {feedback ? <p className="settings-success">{feedback}</p> : null}

                    <button
                        type="submit"
                        className="btn btn-primary btn-full"
                        disabled={!selectedLead || !effectiveTargetSalesId || submitting}
                    >
                        {submitting ? 'Memindahkan...' : 'Alihkan Leads'}
                    </button>
                </form>
            </section>
        </div>
    );
}
