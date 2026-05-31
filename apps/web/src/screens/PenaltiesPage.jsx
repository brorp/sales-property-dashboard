'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { usePagePolling } from '../hooks/usePagePolling';
import { apiRequest } from '../lib/api';
import Select from '../components/Select';
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

    // ─── Tab ────────────────────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState('penalties');

    // ─── Penalties tab state ─────────────────────────────────────────────────
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

    // ─── Immunity tab state ──────────────────────────────────────────────────
    const [immuneList, setImmuneList] = useState([]);
    const [immuneLoading, setImmuneLoading] = useState(false);
    const [immuneError, setImmuneError] = useState('');
    const [immuneSuccess, setImmuneSuccess] = useState('');
    const [addImmuneSalesId, setAddImmuneSalesId] = useState('');
    const [addingImmune, setAddingImmune] = useState(false);
    const [removingImmuneId, setRemovingImmuneId] = useState('');

    const hasAnyFilter = Boolean(search || salesFilter || statusFilter);
    const resetAllFilters = () => { setSearch(''); setSalesFilter(''); setStatusFilter(''); };

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

    const loadImmuneList = useCallback(async ({ silent = false } = {}) => {
        if (!user || !isAdmin) return;
        if (!silent) setImmuneLoading(true);
        try {
            const rows = await apiRequest('/api/penalties/immune', { user });
            setImmuneList(Array.isArray(rows) ? rows : []);
        } catch (err) {
            if (!silent) setImmuneError(err instanceof Error ? err.message : 'Gagal memuat daftar imunitas');
        } finally {
            if (!silent) setImmuneLoading(false);
        }
    }, [user, isAdmin]);

    useEffect(() => { void loadPenalties(); }, [loadPenalties]);
    useEffect(() => { void loadImmuneList(); }, [loadImmuneList]);

    usePagePolling({
        enabled: Boolean(user),
        intervalMs: 3000,
        run: async () => {
            if (submittingCompensation || addingImmune) return;
            await loadPenalties({ silent: true });
            if (activeTab === 'immunity') await loadImmuneList({ silent: true });
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

    const handleAddImmune = async () => {
        if (!addImmuneSalesId) { setImmuneError('Pilih sales terlebih dahulu.'); return; }
        const alreadyImmune = immuneList.some((i) => i.salesId === addImmuneSalesId);
        if (alreadyImmune) { setImmuneError('Sales ini sudah memiliki imunitas penalti.'); return; }
        setAddingImmune(true);
        setImmuneError(''); setImmuneSuccess('');
        try {
            await apiRequest('/api/penalties/immune', {
                method: 'POST', user, body: { salesId: addImmuneSalesId },
            });
            setImmuneSuccess('Imunitas penalti berhasil ditambahkan.');
            setAddImmuneSalesId('');
            await loadImmuneList({ silent: true });
        } catch (err) {
            setImmuneError(err instanceof Error ? err.message : 'Gagal menambahkan imunitas');
        } finally {
            setAddingImmune(false);
        }
    };

    const handleRemoveImmune = async (salesId) => {
        setRemovingImmuneId(salesId);
        setImmuneError(''); setImmuneSuccess('');
        try {
            await apiRequest(`/api/penalties/immune/${salesId}`, { method: 'DELETE', user });
            setImmuneSuccess('Imunitas penalti berhasil dicabut.');
            await loadImmuneList({ silent: true });
        } catch (err) {
            setImmuneError(err instanceof Error ? err.message : 'Gagal mencabut imunitas');
        } finally {
            setRemovingImmuneId('');
        }
    };

    const salesSelectOptions = useMemo(() =>
        salesOptions
            .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')))
            .map((s) => ({ value: s.id, label: s.name })),
        [salesOptions]
    );

    // Sales that are not yet immune — available to add
    const availableToAddOptions = useMemo(() =>
        salesSelectOptions.filter((s) => !immuneList.some((i) => i.salesId === s.value)),
        [salesSelectOptions, immuneList]
    );
    const selectedImmuneSales = useMemo(
        () => availableToAddOptions.find((item) => item.value === addImmuneSalesId) || null,
        [addImmuneSalesId, availableToAddOptions]
    );
    const immuneStats = useMemo(() => ({
        active: immuneList.length,
        available: availableToAddOptions.length,
        totalSales: salesSelectOptions.length,
    }), [availableToAddOptions.length, immuneList.length, salesSelectOptions.length]);

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
                title="Penalti"
                showBack
                backMobileOnly
                rightAction={
                    <button className="btn btn-sm btn-secondary btn-icon-refresh" onClick={() => void loadPenalties()} disabled={loading} title="Refresh">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                    </button>
                }
            />

            {/* Tab bar — only show for admins */}
            {isAdmin && (
                <div className="pen-tab-bar">
                    <button
                        type="button"
                        className={`pen-tab-btn${activeTab === 'penalties' ? ' is-active' : ''}`}
                        onClick={() => setActiveTab('penalties')}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                        Daftar Penalti
                        {penalties.filter((p) => p.status === 'active').length > 0 && (
                            <span className="pen-tab-badge">{penalties.filter((p) => p.status === 'active').length}</span>
                        )}
                    </button>
                    <button
                        type="button"
                        className={`pen-tab-btn${activeTab === 'immunity' ? ' is-active' : ''}`}
                        onClick={() => { setActiveTab('immunity'); void loadImmuneList(); }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        Imunitas
                        {immuneList.length > 0 && (
                            <span className="pen-tab-badge pen-tab-badge--immune">{immuneList.length}</span>
                        )}
                    </button>
                </div>
            )}

            {/* ── Penalties Tab ──────────────────────────────────────────────── */}
            {activeTab === 'penalties' && (
                <>
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
                            <Select
                                placeholder="Semua Status"
                                options={STATUS_OPTIONS}
                                value={statusFilter}
                                onChange={setStatusFilter}
                            />
                            {user?.role !== 'sales' ? (
                                <Select
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
                </>
            )}

            {/* ── Immunity Tab ───────────────────────────────────────────────── */}
            {activeTab === 'immunity' && isAdmin && (
                <div className="pen-immunity">
                    <div className="pen-immunity-intro">
                        <div className="pen-immunity-intro-main">
                            <div className="pen-immunity-intro-icon">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-5"/></svg>
                            </div>
                            <div>
                                <div className="pen-immunity-kicker">Admin Control</div>
                                <div className="pen-immunity-intro-title">Imunitas Penalti</div>
                                <div className="pen-immunity-intro-desc">Bebaskan sales tertentu dari penalty Daily Task untuk kebutuhan operasional khusus. Imunitas aktif bisa dicabut kapan saja.</div>
                            </div>
                        </div>
                        <div className="pen-immunity-stats">
                            <div className="pen-immunity-stat">
                                <span className="pen-immunity-stat-value">{immuneStats.active}</span>
                                <span className="pen-immunity-stat-label">Aktif</span>
                            </div>
                            <div className="pen-immunity-stat">
                                <span className="pen-immunity-stat-value">{immuneStats.available}</span>
                                <span className="pen-immunity-stat-label">Bisa ditambah</span>
                            </div>
                            <div className="pen-immunity-stat">
                                <span className="pen-immunity-stat-value">{immuneStats.totalSales}</span>
                                <span className="pen-immunity-stat-label">Total sales</span>
                            </div>
                        </div>
                    </div>

                    {immuneError ? <div className="settings-error pen-immunity-alert">{immuneError}</div> : null}
                    {immuneSuccess ? <div className="settings-success pen-immunity-alert">{immuneSuccess}</div> : null}

                    {/* Add immunity */}
                    <div className="pen-immunity-add-card">
                        <div className="pen-immunity-add-copy">
                            <div className="pen-immunity-add-title">Tambah Sales Imun</div>
                            <div className="pen-immunity-add-desc">Sales yang dipilih tidak akan terkena penalty baru selama imunitas masih aktif.</div>
                        </div>
                        <div className="pen-immunity-add-body">
                            <div className="pen-immunity-add-row">
                                <div className="pen-immunity-add-select">
                                    <Select
                                        placeholder={availableToAddOptions.length === 0 ? 'Semua sales sudah diimunkan' : 'Pilih Sales...'}
                                        options={availableToAddOptions}
                                        value={addImmuneSalesId}
                                        onChange={(val) => { setAddImmuneSalesId(val); setImmuneError(''); }}
                                        searchable
                                        disabled={availableToAddOptions.length === 0 || addingImmune}
                                    />
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-primary btn-plcrm pen-immunity-add-btn"
                                    onClick={() => void handleAddImmune()}
                                    disabled={!addImmuneSalesId || addingImmune}
                                >
                                    {addingImmune ? 'Menyimpan...' : (
                                        <>
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                                            Aktifkan Imunitas
                                        </>
                                    )}
                                </button>
                            </div>
                            <div className={`pen-immunity-selected${selectedImmuneSales ? ' is-active' : ''}`}>
                                <span className="pen-immunity-selected-dot" />
                                {selectedImmuneSales
                                    ? `${selectedImmuneSales.label} siap diberikan imunitas.`
                                    : availableToAddOptions.length === 0
                                        ? 'Semua sales aktif sudah berada dalam daftar imunitas.'
                                        : 'Pilih satu sales untuk mengaktifkan imunitas penalty.'}
                            </div>
                        </div>
                    </div>

                    {/* Immune list */}
                    {immuneLoading ? (
                        <div className="pen-empty" style={{ minHeight: 160 }}>
                            <p className="pen-empty-title">Memuat daftar imunitas...</p>
                        </div>
                    ) : immuneList.length === 0 ? (
                        <div className="pen-empty pen-immunity-empty">
                            <div className="pen-immunity-empty-icon">
                                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                            </div>
                            <p className="pen-empty-title">Belum ada imunitas aktif</p>
                            <p className="pen-empty-desc">Tambahkan sales yang ingin dibebaskan dari sistem penalti.</p>
                        </div>
                    ) : (
                        <div className="pen-immune-list">
                            <div className="pen-immune-list-head">
                                <div>
                                    <div className="pen-immune-list-title">Daftar Imunitas Aktif</div>
                                    <div className="pen-immune-list-desc">{immuneList.length} sales sedang dibebaskan dari penalty baru.</div>
                                </div>
                                <span className="pen-immune-list-count">{immuneList.length}</span>
                            </div>
                            <div className="pen-immune-grid">
                                {immuneList.map((item) => (
                                    <div key={item.salesId} className="pen-immune-card">
                                        <div className="pen-immune-card-info">
                                            <div className="pen-immune-avatar">
                                                {String(item.salesName || '?')[0].toUpperCase()}
                                            </div>
                                            <div className="pen-immune-copy">
                                                <div className="pen-immune-name">{item.salesName || item.salesId}</div>
                                                {item.grantedAt ? (
                                                    <div className="pen-immune-since">Sejak {formatDateTime(item.grantedAt)}</div>
                                                ) : (
                                                    <div className="pen-immune-since">Tanggal aktif belum tersedia</div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="pen-immune-card-bottom">
                                            <span className="pen-immune-status">
                                                <span className="pen-immune-status-dot" />
                                                Imun Aktif
                                            </span>
                                            <button
                                                type="button"
                                                className="pen-immune-remove-btn"
                                                onClick={() => void handleRemoveImmune(item.salesId)}
                                                disabled={removingImmuneId === item.salesId}
                                                title="Cabut imunitas"
                                            >
                                                {removingImmuneId === item.salesId ? 'Mencabut...' : (
                                                    <>
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                                                        Cabut
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {compensatingPenalty ? (
                <div className="sheet-overlay" onClick={() => setCompensatingPenalty(null)}>
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
                            <button type="button" className="btn btn-primary btn-plcrm" onClick={() => void handleCompensatePenalty()} disabled={submittingCompensation}>
                                {submittingCompensation ? 'Menyimpan...' : 'Kompensasi'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
