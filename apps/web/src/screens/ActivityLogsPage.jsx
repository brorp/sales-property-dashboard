'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

function formatLogTime(value) {
    const date = new Date(value);
    return date.toLocaleString('id-ID', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function ActivityLogsPage() {
    const { user } = useAuth();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [query, setQuery] = useState('');

    const loadLogs = useCallback(async () => {
        if (!user) {
            return;
        }

        setLoading(true);
        setError('');
        try {
            const rows = await apiRequest('/api/activity-logs?limit=500', { user });
            setLogs(Array.isArray(rows) ? rows : []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed loading logs');
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        void loadLogs();
    }, [loadLogs]);

    const sourceOptions = useMemo(() => {
        const set = new Set(logs.map((item) => item.source));
        return ['all', ...Array.from(set)];
    }, [logs]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return logs.filter((item) => {
            if (sourceFilter !== 'all' && item.source !== sourceFilter) {
                return false;
            }
            if (!q) {
                return true;
            }
            return (
                String(item.message || '').toLowerCase().includes(q) ||
                String(item.leadName || '').toLowerCase().includes(q) ||
                String(item.salesName || '').toLowerCase().includes(q) ||
                String(item.eventType || '').toLowerCase().includes(q)
            );
        });
    }, [logs, query, sourceFilter]);

    return (
        <div className="page-container">
            <Header
                title="Activity Log"
                rightAction={
                    <button className="btn btn-sm btn-secondary" onClick={() => void loadLogs()} disabled={loading}>
                        {loading ? 'Loading...' : 'Refresh'}
                    </button>
                }
            />

            <div className="input-icon-wrapper" style={{ marginBottom: 12 }}>
                <span className="input-icon">🔎</span>
                <input
                    type="text"
                    className="input-field"
                    placeholder="Cari message / lead / sales..."
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                />
            </div>

            <div className="filter-pills" style={{ marginBottom: 12 }}>
                {sourceOptions.map((source) => (
                    <button
                        key={source}
                        className={`filter-pill ${sourceFilter === source ? 'active' : ''}`}
                        onClick={() => setSourceFilter(source)}
                    >
                        {source === 'all' ? 'Semua Source' : source}
                    </button>
                ))}
            </div>

            <p className="leads-result-count">{filtered.length} log ditemukan</p>

            {error ? <div className="settings-error">{error}</div> : null}

            <div className="card-list">
                {filtered.length === 0 ? (
                    <div className="card">Belum ada activity log.</div>
                ) : (
                    filtered.map((item) => (
                        <div key={item.id} className="card">
                            <div className="lead-row-top">
                                <span className="badge badge-purple">{item.source}</span>
                                <span className="lead-row-ago">{formatLogTime(item.timestamp)}</span>
                            </div>
                            <div className="lead-row-meta" style={{ marginTop: 6 }}>
                                <span>Event: {item.eventType}</span>
                                {item.leadName ? <span>Lead: {item.leadName}</span> : null}
                                {item.salesName ? <span>Sales: {item.salesName}</span> : null}
                            </div>
                            <div style={{ marginTop: 8, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                {item.message}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
