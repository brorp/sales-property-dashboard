'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { usePagePolling } from '../hooks/usePagePolling';
import { apiRequest } from '../lib/api';

function formatDateTime(value) {
    if (!value) {
        return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '-';
    }

    return date.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatDuration(hours) {
    const safeHours = Math.max(0, Number(hours || 0));
    if (safeHours % 24 === 0) {
        return `${safeHours / 24} hari`;
    }
    return `${safeHours} jam`;
}

function getStatusBadge(status) {
    if (status === 'active') {
        return 'badge-danger';
    }
    if (status === 'compensated') {
        return 'badge-info';
    }
    if (status === 'expired') {
        return 'badge-neutral';
    }
    return 'badge-neutral';
}

export default function PenaltiesPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'client_admin' || user?.role === 'root_admin';
    const [penalties, setPenalties] = useState([]);
    const [salesOptions, setSalesOptions] = useState([]);
    const [salesFilter, setSalesFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [compensatingPenalty, setCompensatingPenalty] = useState(null);
    const [compensationReason, setCompensationReason] = useState('');
    const [submittingCompensation, setSubmittingCompensation] = useState(false);

    const loadPenalties = useCallback(async ({ silent = false } = {}) => {
        if (!user) {
            return;
        }

        if (!silent) {
            setLoading(true);
            setError('');
        }

        try {
            const [rows, salesRows] = await Promise.all([
                apiRequest(
                    `/api/penalties${salesFilter !== 'all' ? `?salesId=${encodeURIComponent(salesFilter)}` : ''}`,
                    { user }
                ),
                user.role === 'sales'
                    ? Promise.resolve([])
                    : apiRequest('/api/sales', { user }),
            ]);

            setPenalties(Array.isArray(rows) ? rows : []);
            setSalesOptions(Array.isArray(salesRows) ? salesRows : []);
        } catch (err) {
            if (!silent) {
                setError(err instanceof Error ? err.message : 'Gagal memuat penalties');
            }
        } finally {
            if (!silent) {
                setLoading(false);
            }
        }
    }, [salesFilter, user]);

    useEffect(() => {
        void loadPenalties();
    }, [loadPenalties]);

    usePagePolling({
        enabled: Boolean(user),
        intervalMs: 3000,
        run: async () => {
            if (submittingCompensation) {
                return;
            }
            await loadPenalties({ silent: true });
        },
    });

    const handleCompensatePenalty = async () => {
        if (!user || !compensatingPenalty) {
            return;
        }

        if (!compensationReason.trim()) {
            setError('Alasan kompensasi wajib diisi.');
            return;
        }

        setSubmittingCompensation(true);
        setError('');
        setSuccess('');
        try {
            await apiRequest(`/api/penalties/${compensatingPenalty.id}/compensate`, {
                method: 'POST',
                user,
                body: {
                    reason: compensationReason.trim(),
                },
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

    const filteredSalesOptions = useMemo(() => {
        return salesOptions.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
    }, [salesOptions]);

    return (
        <div className="page-container">
            <Header title="Penalties" />

            <div className="card penalties-summary-card">
                <div>
                    <div className="section-title" style={{ marginBottom: 6 }}>Riwayat Penalty Daily Task</div>
                    <div className="settings-help" style={{ margin: 0 }}>
                        Admin melihat semua penalty. Supervisor hanya melihat sales di bawah hirarki mereka, dan sales hanya melihat penalti miliknya sendiri.
                    </div>
                </div>

                {user?.role !== 'sales' ? (
                    <div className="input-group penalties-filter-group">
                        <label>Filter Sales</label>
                        <select
                            className="input-field"
                            value={salesFilter}
                            onChange={(event) => setSalesFilter(event.target.value)}
                        >
                            <option value="all">Semua Sales</option>
                            {filteredSalesOptions.map((item) => (
                                <option key={item.id} value={item.id}>{item.name}</option>
                            ))}
                        </select>
                    </div>
                ) : null}
            </div>

            {error ? <div className="settings-error">{error}</div> : null}
            {success ? <div className="settings-success">{success}</div> : null}

            {loading ? (
                <div className="card"><p className="settings-help">Loading penalties...</p></div>
            ) : null}

            {!loading && penalties.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-title">Belum ada penalty</div>
                    <div className="empty-subtitle">Penalty akan muncul ketika Daily Task melewati batas 24 jam tanpa action.</div>
                </div>
            ) : null}

            <div className="penalties-list">
                {penalties.map((item) => (
                    <div key={item.id} className="card penalty-card">
                        <div className="penalty-card-top">
                            <div>
                                <div className="penalty-card-title">{item.salesName || 'Sales'}</div>
                                <div className="penalty-card-subtitle">{item.taskLabel} • {item.leadName || '-'}</div>
                            </div>
                            <div className="penalty-card-badges">
                                <span className="badge badge-danger">#{item.penaltySequence}</span>
                                <span className={`badge ${getStatusBadge(item.status)}`}>{item.status}</span>
                                {item.spLevel && item.spLevel !== 'none' ? (
                                    <span className="badge badge-purple">{String(item.spLevel).toUpperCase()}</span>
                                ) : null}
                            </div>
                        </div>

                        <div className="penalty-grid">
                            <div><strong>Task:</strong> {item.taskType === 'follow_up' ? `Follow Up ${item.followupStage}` : 'New Lead'}</div>
                            <div><strong>Lead:</strong> {item.leadName || '-'}</div>
                            <div><strong>Mulai blok:</strong> {formatDateTime(item.blockedFrom)}</div>
                            <div><strong>Selesai blok:</strong> {formatDateTime(item.blockedUntil)}</div>
                            <div><strong>Durasi:</strong> {formatDuration(item.durationHours)}</div>
                            <div><strong>SP:</strong> {item.spLevel === 'none' ? '-' : String(item.spLevel).toUpperCase()}</div>
                            <div><strong>Dibuat:</strong> {formatDateTime(item.createdAt)}</div>
                            <div><strong>Diupdate:</strong> {formatDateTime(item.updatedAt)}</div>
                        </div>

                        <div className="penalty-reason-box">
                            <strong>Reason</strong>
                            <div>{item.reason || '-'}</div>
                            {item.compensationReason ? (
                                <div className="settings-help" style={{ marginTop: 8 }}>
                                    Kompensasi: {item.compensationReason}
                                </div>
                            ) : null}
                        </div>

                        {isAdmin && item.status !== 'compensated' && item.status !== 'invalid' ? (
                            <div className="penalty-actions">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => {
                                        setCompensatingPenalty(item);
                                        setCompensationReason('');
                                        setError('');
                                    }}
                                >
                                    Kompensasi Penalty
                                </button>
                            </div>
                        ) : null}
                    </div>
                ))}
            </div>

            {compensatingPenalty ? (
                <div className="modal-overlay" onClick={() => setCompensatingPenalty(null)}>
                    <div className="modal-content" onClick={(event) => event.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Kompensasi Penalty</h3>
                        </div>
                        <p className="settings-help">
                            Penalty untuk <strong>{compensatingPenalty.salesName}</strong> akan tetap tersimpan di history, tetapi tidak lagi dihitung untuk blocking dan eskalasi.
                        </p>
                        <div className="input-group">
                            <label>Alasan Kompensasi</label>
                            <textarea
                                className="input-field"
                                rows={3}
                                value={compensationReason}
                                onChange={(event) => setCompensationReason(event.target.value)}
                                placeholder="Contoh: kesalahan sistem / kondisi darurat"
                            />
                        </div>
                        <div className="modal-actions">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setCompensatingPenalty(null)}
                                disabled={submittingCompensation}
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => void handleCompensatePenalty()}
                                disabled={submittingCompensation}
                            >
                                {submittingCompensation ? 'Menyimpan...' : 'Kompensasi'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
