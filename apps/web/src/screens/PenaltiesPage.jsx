'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { usePagePolling } from '../hooks/usePagePolling';
import { apiRequest } from '../lib/api';
import SelectFilter from '../components/SelectFilter';
import './PenaltiesPage.css';

function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function formatDuration(hours) {
    const safeHours = Math.max(0, Number(hours || 0));
    if (safeHours % 24 === 0) return `${safeHours / 24} hari`;
    return `${safeHours} jam`;
}

function getStatusBadgeClass(status) {
    if (status === 'active') return 'badge-danger';
    if (status === 'compensated') return 'badge-info';
    return 'badge-neutral';
}

const STATUS_OPTIONS = [
    { value: 'active', label: 'Active' },
    { value: 'compensated', label: 'Compensated' },
    { value: 'expired', label: 'Expired' },
];

export default function PenaltiesPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'client_admin' || user?.role === 'root_admin';
    const [penalties, setPenalties] = useState([]);
    const [salesOptions, setSalesOptions] = useState([]);
    const [search, setSearch] = useState('');
    const [salesFilter, setSalesFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [compensatingPenalty, setCompensatingPenalty] = useState(null);
    const [compensationReason, setCompensationReason] = useState('');
    const [submittingCompensation, setSubmittingCompensation] = useState(false);

    const hasAnyFilter = Boolean(search || salesFilter || statusFilter);
    const resetAllFilters = () => { setSearch(''); setSalesFilter(''); setStatusFilter(''); };

    useEffect(() => {
        document.body.classList.add('light-page');
        return () => document.body.classList.remove('light-page');
    }, []);

    const loadPenalties = useCallback(async ({ silent = false } = {}) => {
        if (!user) return;
        if (!silent) { setLoading(true); setError(''); }
        try {
            const [rows, salesRows] = await Promise.all([
                apiRequest('/api/penalties', { user }),
                user.role === 'sales' ? Promise.resolve([]) : apiRequest('/api/sales', { user }),
            ]);
            setPenalties(Array.isArray(rows) ? rows : []);
            setSalesOptions(Array.isArray(salesRows) ? salesRows : []);
        } catch (err) {
            if (!silent) setError(err instanceof Error ? err.message : 'Gagal memuat penalties');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [user]);

    useEffect(() => { void loadPenalties(); }, [loadPenalties]);

    usePagePolling({
        enabled: Boolean(user),
        intervalMs: 3000,
        run: async () => {
            if (submittingCompensation) return;
            await loadPenalties({ silent: true });
        },
    });

    const handleCompensatePenalty = async () => {
        if (!user || !compensatingPenalty) return;
        if (!compensationReason.trim()) { setError('Alasan kompensasi wajib diisi.'); return; }
        setSubmittingCompensation(true);
        setError(''); setSuccess('');
        try {
            await apiRequest(`/api/penalties/${compensatingPenalty.id}/compensate`, {
                method: 'POST', user, body: { reason: compensationReason.trim() },
            });
            setSuccess('Penalty berhasil dikompensasi.');
            setCompensatingPenalty(null);
            setCompensationReason('');
            await loadPenalties({ silent: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal mengompensasi penalty');
        } finally {
            setSubmittingCompensation(false);
        }
    };

    const salesSelectOptions = useMemo(() =>
        salesOptions
            .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')))
            .map((s) => ({ value: s.id, label: s.name })),
        [salesOptions]
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return penalties.filter((item) => {
            if (salesFilter && item.salesId !== salesFilter) return false;
            if (statusFilter && item.status !== statusFilter) return false;
            if (!q) return true;
            return (
                String(item.salesName || '').toLowerCase().includes(q) ||
                String(item.leadName || '').toLowerCase().includes(q) ||
                String(item.reason || '').toLowerCase().includes(q)
            );
        });
    }, [penalties, salesFilter, statusFilter, search]);

    return (
        <div className="page-container pen-page">
            <Header
                title="Penalties"
                rightAction={
                    <button className="btn btn-sm btn-secondary" onClick={() => void loadPenalties()} disabled={loading}>
                        {loading ? 'Loading...' : 'Refresh'}
                    </button>
                }
            />

            <div className="pen-filter-bar">
                <div className="input-icon-wrapper pen-search-wrap">
                    <span className="input-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                        </svg>
                    </span>
                    <input
                        type="text"
                        className="input-field"
                        placeholder="Cari sales atau lead..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="pen-selects-row">
                    <SelectFilter
                        placeholder="Semua Status"
                        options={STATUS_OPTIONS}
                        value={statusFilter}
                        onChange={setStatusFilter}
                    />
                    {user?.role !== 'sales' ? (
                        <SelectFilter
                            placeholder="Semua Sales"
                            options={salesSelectOptions}
                            value={salesFilter}
                            onChange={setSalesFilter}
                        />
                    ) : null}
                </div>
                {hasAnyFilter ? (
                    <button type="button" className="pen-reset-all" onClick={resetAllFilters}>Reset</button>
                ) : null}
            </div>

            {error ? <div className="settings-error">{error}</div> : null}
            {success ? <div className="settings-success">{success}</div> : null}

            {filtered.length > 0 ? (
                <p className="pen-result-count">{filtered.length} penalty</p>
            ) : null}

            {loading ? (
                <div className="pen-empty">
                    <p className="pen-empty-title">Memuat data...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="pen-empty">
                    <div className="pen-empty-icon">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                    </div>
                    <p className="pen-empty-title">{hasAnyFilter ? 'Tidak ada hasil' : 'Belum ada penalty'}</p>
                    <p className="pen-empty-desc">
                        {hasAnyFilter
                            ? 'Coba ubah atau hapus filter yang aktif.'
                            : 'Penalty muncul ketika Daily Task melewati batas 24 jam tanpa action.'}
                    </p>
                    {hasAnyFilter ? (
                        <button className="pen-empty-reset" onClick={resetAllFilters}>Hapus semua filter</button>
                    ) : null}
                </div>
            ) : (
                <div className="pen-list">
                    {filtered.map((item) => (
                        <div key={item.id} className="pen-card">
                            <div className="pen-card-head">
                                <div className="pen-card-head-info">
                                    <div className="pen-card-name">{item.salesName || 'Sales'}</div>
                                    <div className="pen-card-sub">{item.taskLabel} · {item.leadName || '-'}</div>
                                </div>
                                <div className="pen-card-badges">
                                    <span className="badge badge-danger">#{item.penaltySequence}</span>
                                    <span className={`badge ${getStatusBadgeClass(item.status)}`}>{item.status}</span>
                                    {item.spLevel && item.spLevel !== 'none' ? (
                                        <span className="badge badge-purple">{String(item.spLevel).toUpperCase()}</span>
                                    ) : null}
                                </div>
                            </div>

                            <div className="pen-card-grid">
                                <div className="pen-card-cell">
                                    <span className="pen-card-key">Task</span>
                                    <span className="pen-card-val">{item.taskType === 'follow_up' ? `Follow Up ${item.followupStage}` : 'New Lead'}</span>
                                </div>
                                <div className="pen-card-cell">
                                    <span className="pen-card-key">Durasi</span>
                                    <span className="pen-card-val">{formatDuration(item.durationHours)}</span>
                                </div>
                                <div className="pen-card-cell">
                                    <span className="pen-card-key">Mulai blok</span>
                                    <span className="pen-card-val">{formatDateTime(item.blockedFrom)}</span>
                                </div>
                                <div className="pen-card-cell">
                                    <span className="pen-card-key">Selesai blok</span>
                                    <span className="pen-card-val">{formatDateTime(item.blockedUntil)}</span>
                                </div>
                                <div className="pen-card-cell">
                                    <span className="pen-card-key">SP</span>
                                    <span className="pen-card-val">{item.spLevel === 'none' ? '-' : String(item.spLevel).toUpperCase()}</span>
                                </div>
                                <div className="pen-card-cell">
                                    <span className="pen-card-key">Dibuat</span>
                                    <span className="pen-card-val">{formatDateTime(item.createdAt)}</span>
                                </div>
                            </div>

                            {item.reason ? (
                                <div className="pen-card-reason">
                                    <span className="pen-card-key">Reason</span>
                                    <div className="pen-card-reason-text">{item.reason}</div>
                                    {item.compensationReason ? (
                                        <div className="pen-card-reason-comp">Kompensasi: {item.compensationReason}</div>
                                    ) : null}
                                </div>
                            ) : null}

                            {isAdmin && item.status !== 'compensated' && item.status !== 'invalid' ? (
                                <div className="pen-card-actions">
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-secondary"
                                        onClick={() => { setCompensatingPenalty(item); setCompensationReason(''); setError(''); }}
                                    >
                                        Kompensasi Penalty
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    ))}
                </div>
            )}

            {compensatingPenalty ? (
                <div className="modal-overlay" onClick={() => setCompensatingPenalty(null)}>
                    <div className="bottom-sheet" onClick={(event) => event.stopPropagation()}>
                        <div className="sheet-handle" />
                        <h2>Kompensasi Penalty</h2>
                        <p className="settings-help">
                            Penalty untuk <strong>{compensatingPenalty.salesName}</strong> akan tetap tersimpan di history, tetapi tidak lagi dihitung untuk blocking dan eskalasi.
                        </p>
                        <div className="input-group" style={{ marginTop: 16 }}>
                            <label>Alasan Kompensasi</label>
                            <textarea
                                className="input-field"
                                rows={5}
                                value={compensationReason}
                                onChange={(event) => setCompensationReason(event.target.value)}
                                placeholder="Contoh: kesalahan sistem / kondisi darurat"
                            />
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                            <button type="button" className="btn btn-secondary" onClick={() => setCompensatingPenalty(null)} disabled={submittingCompensation}>
                                Batal
                            </button>
                            <button type="button" className="btn btn-primary" onClick={() => void handleCompensatePenalty()} disabled={submittingCompensation}>
                                {submittingCompensation ? 'Menyimpan...' : 'Kompensasi'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
