'use client';

import { useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';
import Select from '../components/Select';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import { useToast } from '../context/ToastContext';
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
    const { leads, getSalesUsers, getLeadSources, reassignLead, reassignLeadsBulk, refreshLeads, refreshSalesUsers } = useLeads();
    const toast = useToast();
    const [search, setSearch] = useState('');
    const [selectedLeadId, setSelectedLeadId] = useState('');
    const [targetSalesId, setTargetSalesId] = useState('');
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Filters for leads list
    const [sourceFilter, setSourceFilter] = useState('');
    const [salesOwnerFilter, setSalesOwnerFilter] = useState('');

    // Bulk Mode State
    const [isBulkMode, setIsBulkMode] = useState(false);
    const [selectedLeadIds, setSelectedLeadIds] = useState(new Set());

    const salesUsers = getSalesUsers();
    const leadSources = getLeadSources();

    const sourceOptions = useMemo(() => {
        return leadSources.map((src) => {
            const val = src?.value || src;
            return {
                value: val,
                label: val,
            };
        });
    }, [leadSources]);

    const salesFilterOptions = useMemo(() => {
        const activeSales = salesUsers.filter((s) => s.isActive !== false);
        const inactiveSales = salesUsers.filter((s) => s.isActive === false);

        const options = [];
        if (activeSales.length > 0) {
            options.push({ isGroupHeader: true, label: 'Aktif' });
            activeSales.forEach((s) => {
                options.push({ value: s.id, label: s.name });
            });
        }
        if (inactiveSales.length > 0) {
            options.push({ isGroupHeader: true, label: 'Nonaktif' });
            inactiveSales.forEach((s) => {
                options.push({ value: s.id, label: s.name });
            });
        }
        return options;
    }, [salesUsers]);

    const assignedLeads = useMemo(() => {
        let list = leads.filter((lead) => Boolean(lead.assignedTo));
        if (sourceFilter) {
            list = list.filter((lead) => lead.source === sourceFilter);
        }
        if (salesOwnerFilter) {
            list = list.filter((lead) => lead.assignedTo === salesOwnerFilter);
        }
        return list.filter((lead) => leadMatchesSearch(lead, search));
    }, [leads, search, sourceFilter, salesOwnerFilter]);

    const selectedLead = useMemo(
        () => leads.find((lead) => lead.id === selectedLeadId) || assignedLeads[0] || null,
        [assignedLeads, leads, selectedLeadId]
    );

    const availableSales = useMemo(() => {
        if (isBulkMode) {
            return salesUsers.filter((sales) => sales.isActive !== false);
        }
        return salesUsers.filter((sales) => sales.isActive !== false && sales.id !== selectedLead?.assignedTo);
    }, [salesUsers, selectedLead?.assignedTo, isBulkMode]);

    const salesOptions = useMemo(() => {
        const activeSales = availableSales.filter((s) => s.isSuspended !== true);
        const suspendedSales = availableSales.filter((s) => s.isSuspended === true);

        const options = [];
        if (activeSales.length > 0) {
            options.push({ isGroupHeader: true, label: 'Aktif' });
            activeSales.forEach((s) => {
                options.push({ value: s.id, label: s.name });
            });
        }
        if (suspendedSales.length > 0) {
            options.push({ isGroupHeader: true, label: 'Suspended' });
            suspendedSales.forEach((s) => {
                options.push({ value: s.id, label: s.name });
            });
        }
        return options;
    }, [availableSales]);

    const activeLeadId = selectedLead?.id || '';
    const effectiveTargetSalesId = targetSalesId && availableSales.some((sales) => sales.id === targetSalesId) ? targetSalesId : '';

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (isBulkMode) {
            if (selectedLeadIds.size === 0) {
                setError('Pilih minimal satu lead untuk dialihkan.');
                return;
            }
            if (!effectiveTargetSalesId) {
                setError('Pilih sales tujuan.');
                return;
            }
            if (!note.trim()) {
                setError('Catatan emergency wajib diisi agar audit jelas.');
                return;
            }

            setSubmitting(true);
            setError('');
            try {
                const result = await reassignLeadsBulk({
                    leadIds: Array.from(selectedLeadIds),
                    targetSalesId: effectiveTargetSalesId,
                    note: note.trim(),
                });
                toast.success(`Berhasil mengalihkan ${result.updated} lead ke sales baru. (Dilewati: ${result.skipped})`);
                setSelectedLeadIds(new Set());
                setTargetSalesId('');
                setNote('');
                await Promise.all([refreshLeads(), refreshSalesUsers()]);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Gagal melakukan reassign massal');
            } finally {
                setSubmitting(false);
            }
            return;
        }

        if (!selectedLead) { setError('Pilih lead yang ingin dipindahkan.'); return; }
        if (!effectiveTargetSalesId) { setError('Pilih sales tujuan yang berbeda dari sales saat ini.'); return; }
        if (!note.trim()) { setError('Catatan emergency wajib diisi agar audit jelas.'); return; }

        setSubmitting(true);
        setError('');
        try {
            const result = await reassignLead(selectedLead.id, {
                targetSalesId: effectiveTargetSalesId,
                note: note.trim(),
            });
            toast.success(`Lead berhasil direassign ke ${result?.toSalesName || 'sales baru'}. Task New Lead sudah dipindahkan.`);
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
                    <div className="settings-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: '0 0 2px', fontSize: '0.9375rem', color: '#1E3A5F' }}>Pilih Lead</h3>
                            <p className="settings-help" style={{ marginTop: 0 }}>
                                {isBulkMode ? `${selectedLeadIds.size} lead terpilih` : `${assignedLeads.length} lead assigned di workspace aktif`}
                            </p>
                        </div>
                        <button
                            type="button"
                            className={`reassign-bulk-toggle-btn${isBulkMode ? ' is-active' : ''}`}
                            onClick={() => {
                                setIsBulkMode(!isBulkMode);
                                setSelectedLeadIds(new Set());
                                setSelectedLeadId('');
                                setError('');
                            }}
                            title={isBulkMode ? 'Batal' : 'Pilih Banyak'}
                        >
                            {isBulkMode ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m3 16 2 2 4-4"></path>
                                    <path d="m3 9 2 2 4-4"></path>
                                    <path d="M13 6h8"></path>
                                    <path d="M13 12h8"></path>
                                    <path d="M13 18h8"></path>
                                </svg>
                            )}
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
                        {isBulkMode && assignedLeads.length > 0 && (
                            <button
                                type="button"
                                style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '10px',
                                    border: '1.5px solid var(--border-color)',
                                    background: 'var(--bg-card)',
                                    color: 'var(--text-secondary)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    flexShrink: 0,
                                    transition: 'all 150ms ease'
                                }}
                                onClick={() => {
                                    const allIds = assignedLeads.map((l) => l.id);
                                    const allSelected = allIds.every((id) => selectedLeadIds.has(id));
                                    if (allSelected) {
                                        setSelectedLeadIds(new Set());
                                    } else {
                                        setSelectedLeadIds(new Set(allIds));
                                    }
                                }}
                                title={assignedLeads.every((l) => selectedLeadIds.has(l.id)) ? 'Deselect All' : 'Select All'}
                            >
                                <div 
                                    className={`reassign-check-circle${assignedLeads.every((l) => selectedLeadIds.has(l.id)) ? ' is-checked' : ''}`}
                                    style={{
                                        width: '20px',
                                        height: '20px',
                                        borderRadius: '6px',
                                        border: '2px solid var(--border-color)',
                                        backgroundColor: assignedLeads.every((l) => selectedLeadIds.has(l.id)) ? 'var(--primary)' : 'transparent',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#FFFFFF',
                                        flexShrink: 0,
                                        transition: 'all 150ms ease'
                                    }}
                                >
                                    {assignedLeads.every((l) => selectedLeadIds.has(l.id)) ? (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                    ) : null}
                                </div>
                            </button>
                        )}
                        <input
                            className="input-field"
                            style={{ flex: 1, margin: 0, height: '40px' }}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Cari nama, nomor, source, sales..."
                        />
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        <div style={{ flex: 1 }}>
                            <Select
                                placeholder="Semua Sumber"
                                value={sourceFilter}
                                onChange={setSourceFilter}
                                options={sourceOptions}
                                variant="white"
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <Select
                                placeholder="Semua Sales"
                                value={salesOwnerFilter}
                                onChange={setSalesOwnerFilter}
                                options={salesFilterOptions}
                                variant="white"
                            />
                        </div>
                    </div>
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
                                className={`settings-queue-item reassign-lead-item ${isBulkMode ? (selectedLeadIds.has(lead.id) ? 'is-selected' : '') : (activeLeadId === lead.id ? 'is-selected' : '')}`}
                                onClick={() => {
                                    if (isBulkMode) {
                                        setSelectedLeadIds((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(lead.id)) next.delete(lead.id); else next.add(lead.id);
                                            return next;
                                        });
                                        setError('');
                                    } else {
                                        setSelectedLeadId(lead.id);
                                        setTargetSalesId('');
                                        setError('');
                                    }
                                }}
                            >
                                <div className="settings-queue-main">
                                    {isBulkMode ? (
                                        <div 
                                            className={`reassign-check-circle${selectedLeadIds.has(lead.id) ? ' is-checked' : ''}`}
                                            style={{
                                                width: '34px',
                                                height: '34px',
                                                borderRadius: '50%',
                                                border: '2px solid var(--border-color)',
                                                backgroundColor: selectedLeadIds.has(lead.id) ? 'var(--primary)' : 'var(--bg-card)',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: '#FFFFFF',
                                                flexShrink: 0,
                                                transition: 'all 150ms ease'
                                            }}
                                        >
                                            {selectedLeadIds.has(lead.id) ? (
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <span className="settings-queue-order">{String(lead.name || '?').charAt(0).toUpperCase()}</span>
                                    )}
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

                    {isBulkMode ? (
                        selectedLeadIds.size > 0 ? (
                            <div className="reassign-summary">
                                <div>
                                    <span className="settings-queue-meta">Leads Terpilih</span>
                                    <strong>{selectedLeadIds.size} Leads</strong>
                                </div>
                                <div>
                                    <span className="settings-queue-meta">Daftar Leads</span>
                                    <div style={{ maxHeight: '80px', overflowY: 'auto', fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                                        {assignedLeads.filter((l) => selectedLeadIds.has(l.id)).map((l) => l.name).join(', ')}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="settings-live-offer">Pilih satu atau beberapa lead dari daftar untuk mulai reassign massal.</div>
                        )
                    ) : selectedLead ? (
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
                            options={salesOptions}
                            value={effectiveTargetSalesId}
                            onChange={(val) => setTargetSalesId(val)}
                            placeholder="Pilih sales"
                            clearable={false}
                            disabled={isBulkMode ? (selectedLeadIds.size === 0 || submitting) : (!selectedLead || submitting)}
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
                            disabled={isBulkMode ? (selectedLeadIds.size === 0 || submitting) : (!selectedLead || submitting)}
                        />
                    </div>

                    {error ? <p className="settings-error">{error}</p> : null}

                    <button
                        type="submit"
                        className="btn btn-primary btn-full"
                        disabled={isBulkMode ? (selectedLeadIds.size === 0 || !effectiveTargetSalesId || submitting) : (!selectedLead || !effectiveTargetSalesId || submitting)}
                    >
                        {submitting ? 'Memindahkan...' : (isBulkMode ? `Alihkan ${selectedLeadIds.size} Leads` : 'Alihkan Leads')}
                    </button>
                </form>
            </section>
        </div>
    );
}
