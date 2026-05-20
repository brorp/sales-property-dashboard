'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';
import SelectFilter from '../components/SelectFilter';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import './ActivityLogsPage.css';

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

function formatSourceLabel(value) {
    return String(value || 'activity')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function ActivityLogsPage() {
    const { user } = useAuth();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [sourceFilter, setSourceFilter] = useState('');
    const [query, setQuery] = useState('');

    useEffect(() => {
        document.body.classList.add('light-page');
        return () => document.body.classList.remove('light-page');
    }, []);

    const loadLogs = useCallback(async () => {
        if (!user) return;
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
        const set = new Set(logs.map((item) => item.source).filter(Boolean));
        return Array.from(set).sort().map((s) => ({ value: s, label: formatSourceLabel(s) }));
    }, [logs]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return logs.filter((item) => {
            if (sourceFilter && item.source !== sourceFilter) return false;
            if (!q) return true;
            return (
                String(item.message || '').toLowerCase().includes(q) ||
                String(item.leadName || '').toLowerCase().includes(q) ||
                String(item.salesName || '').toLowerCase().includes(q) ||
                String(item.eventType || '').toLowerCase().includes(q)
            );
        });
    }, [logs, query, sourceFilter]);

    const hasAnyFilter = Boolean(query || sourceFilter);
    const resetAllFilters = () => { setQuery(''); setSourceFilter(''); };

    return (
        <div className="page-container dash-page activity-page">
            <Header
                title="Activity Log"
                rightAction={
                    <button className="btn btn-sm btn-secondary btn-icon-refresh" onClick={() => void loadLogs()} disabled={loading} title="Refresh">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    </button>
                }
            />

            {/* ── Filter bar ──────────────────────────────────── */}
            <div className="al-filter-bar">
                <div className="al-search-wrap">
                    <svg className="al-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        type="text"
                        className="al-search-input"
                        placeholder="Cari message / lead / sales..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>
                {sourceOptions.length > 0 ? (
                    <div className="al-selects-row">
                        <SelectFilter
                            placeholder="Source"
                            value={sourceFilter}
                            onChange={setSourceFilter}
                            options={sourceOptions}
                        />
                    </div>
                ) : null}
                {hasAnyFilter ? (
                    <button type="button" className="al-reset-all" onClick={resetAllFilters}>Reset</button>
                ) : null}
            </div>

            <p className="al-result-count">{filtered.length} log ditemukan</p>

            {error ? <div className="settings-error">{error}</div> : null}

            {/* ── Log list ────────────────────────────────────── */}
            {filtered.length === 0 ? (
                <div className="al-empty">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
                    </svg>
                    <span className="al-empty-title">Belum ada activity log</span>
                    <span className="al-empty-desc">Coba ubah filter pencarian</span>
                </div>
            ) : (
                <div className="al-list">
                    {filtered.map((item) => (
                        <div key={item.id} className="al-item">
                            <div className="al-item-head">
                                <span className="badge badge-purple">{formatSourceLabel(item.source)}</span>
                                <span className="al-item-time">{formatLogTime(item.timestamp)}</span>
                            </div>
                            <div className="al-item-meta">
                                <span>
                                    <span className="al-item-meta-key">Event </span>
                                    <span className="al-item-meta-value">{item.eventType}</span>
                                </span>
                                {item.leadName ? (
                                    <span>
                                        <span className="al-item-meta-key">Lead </span>
                                        <span className="al-item-meta-value">{item.leadName}</span>
                                    </span>
                                ) : null}
                                {item.salesName ? (
                                    <span>
                                        <span className="al-item-meta-key">Sales </span>
                                        <span className="al-item-meta-value">{item.salesName}</span>
                                    </span>
                                ) : null}
                            </div>
                            <div className="al-item-message">{item.message}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
