'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import { getRejectedReasonLabel, getSalesStatusLabel, getResultStatusLabel } from '../constants/crm';
import { apiRequest } from '../lib/api';
import Header from '../components/Header';

const STATUS_COLOR_MAP = {
    hot: 'var(--hot)',
    warm: 'var(--warm)',
    cold: 'var(--cold)',
    error: '#F97316',
    no_response: '#94A3B8',
    skip: 'var(--purple)',
    unfilled: '#64748B',
};

function toConicGradient(items, total, colorFor, emptyColor = 'var(--bg-input)') {
    if (!total || !items.length) {
        return `conic-gradient(${emptyColor} 0deg 360deg)`;
    }

    let current = 0;
    const segments = [];

    for (const item of items) {
        if (!item.count) {
            continue;
        }
        const value = (item.count / total) * 360;
        const next = current + value;
        segments.push(`${colorFor(item)} ${current}deg ${next}deg`);
        current = next;
    }

    if (!segments.length) {
        return `conic-gradient(${emptyColor} 0deg 360deg)`;
    }

    if (current < 360) {
        segments.push(`${emptyColor} ${current}deg 360deg`);
    }

    return `conic-gradient(${segments.join(', ')})`;
}

export default function DashboardPage() {
    const { user, isAdmin } = useAuth();
    const {
        dashboardAnalytics,
        getStats,
        refreshAll,
    } = useLeads();
    const router = useRouter();
    const [refreshing, setRefreshing] = useState(false);
    const [holdActionLoadingId, setHoldActionLoadingId] = useState('');
    const [holdActionMessage, setHoldActionMessage] = useState('');
    const [holdActionError, setHoldActionError] = useState('');

    const stats = getStats();

    const analytics = useMemo(() => {
        return dashboardAnalytics || {
            surveyRatio: { totalLeads: 0, surveyedLeads: 0, ratioPercent: 0 },
            flowOverview: { open: 0, assigned: 0 },
            perAgentSurveyRatio: [],
            statusPie: { total: 0, items: [] },
            domicileBars: [],
            ongoingAppointments: [],
            resultRecap: { total: 0, items: [], cancelReasons: { total: 0, items: [] } },
            holdLeads: [],
        };
    }, [dashboardAnalytics]);

    const statusPieGradient = useMemo(() => {
        return toConicGradient(
            analytics.statusPie.items,
            analytics.statusPie.total,
            (item) => STATUS_COLOR_MAP[item.key] || 'var(--primary-light)'
        );
    }, [analytics.statusPie.items, analytics.statusPie.total]);

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await refreshAll();
        } finally {
            setRefreshing(false);
        }
    };

    const handleStartHeldLead = async (leadId) => {
        setHoldActionLoadingId(leadId);
        setHoldActionMessage('');
        setHoldActionError('');

        try {
            await apiRequest(`/api/distribution/leads/${leadId}/start`, {
                method: 'POST',
                user,
            });
            await refreshAll();
            setHoldActionMessage('Distribusi untuk lead hold berhasil dimulai.');
        } catch (err) {
            setHoldActionError(err instanceof Error ? err.message : 'Gagal memulai distribusi lead hold');
        } finally {
            setHoldActionLoadingId('');
        }
    };

    return (
        <div className="page-container">
            <Header
                title={isAdmin ? 'Admin Dashboard' : 'Sales Dashboard'}
                rightAction={(
                    <button className="btn btn-sm btn-secondary" onClick={() => void handleRefresh()} disabled={refreshing}>
                        {refreshing ? 'Loading...' : 'Refresh'}
                    </button>
                )}
            />

            {isAdmin && analytics.holdLeads.length > 0 ? (
                <section className="dash-section">
                    <h2 className="section-title">Leads Hold (Outside Operational Hours)</h2>
                    {holdActionError ? <div className="settings-error">{holdActionError}</div> : null}
                    {holdActionMessage ? <div className="settings-success">{holdActionMessage}</div> : null}
                    <div className="card-list">
                        {analytics.holdLeads.map((item) => (
                            <div key={item.id} className="card hold-lead-card">
                                <div className="lead-row-top">
                                    <div className="lead-row-name">{item.name}</div>
                                    <span className="badge badge-purple">Hold</span>
                                </div>
                                <div className="lead-row-meta">
                                    <span>📱 {item.phone}</span>
                                    <span>📣 {item.source}</span>
                                </div>
                                <div className="lead-row-meta">
                                    <span>Masuk: {new Date(item.createdAt).toLocaleString('id-ID')}</span>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-primary btn-full hold-lead-action"
                                    onClick={() => void handleStartHeldLead(item.id)}
                                    disabled={holdActionLoadingId === item.id}
                                >
                                    {holdActionLoadingId === item.id ? 'Starting...' : 'Start Distribution'}
                                </button>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            <div className="stats-grid">
                <div className="stat-card stat-total">
                    <span className="stat-label">Total Leads</span>
                    <span className="stat-value">{stats.total}</span>
                </div>
                <div className="stat-card stat-pending">
                    <span className="stat-label">Open</span>
                    <span className="stat-value" style={{ color: 'var(--warm)' }}>{stats.open}</span>
                </div>
                <div className="stat-card stat-hot">
                    <span className="stat-label">Assigned</span>
                    <span className="stat-value" style={{ color: 'var(--primary-light)' }}>{stats.assigned}</span>
                </div>
                <div className="stat-card stat-closed">
                    <span className="stat-label">Closing</span>
                    <span className="stat-value" style={{ color: 'var(--success)' }}>{stats.closed}</span>
                </div>
            </div>

            <section className="dash-section">
                <div className="card">
                    <div className="section-title">Survey Rate Ratio</div>
                    <div className="lead-row-meta" style={{ marginBottom: 8 }}>
                        <span>Total Leads: {analytics.surveyRatio.totalLeads}</span>
                        <span>Sudah Survey: {analytics.surveyRatio.surveyedLeads}</span>
                    </div>
                    <div className="chart-track" style={{ marginBottom: 8 }}>
                        <div className="chart-fill" style={{ width: `${Math.max(analytics.surveyRatio.ratioPercent, analytics.surveyRatio.surveyedLeads > 0 ? 2 : 0)}%`, background: 'linear-gradient(90deg, var(--primary), var(--success))' }} />
                    </div>
                    <div className="lead-row-meta">
                        <span>{isAdmin ? 'Overall Ratio' : 'Agent Ratio'}</span>
                        <strong>{analytics.surveyRatio.ratioPercent}%</strong>
                    </div>
                </div>
            </section>

            {isAdmin && analytics.perAgentSurveyRatio.length > 0 ? (
                <section className="dash-section">
                    <h2 className="section-title">Survey Ratio per Agent</h2>
                    <div className="card agent-pie-grid">
                        {analytics.perAgentSurveyRatio.map((item) => (
                            <div key={item.salesId} className="agent-pie-card">
                                <div className="mini-pie" style={{ background: `conic-gradient(var(--success) 0deg ${(item.ratioPercent / 100) * 360}deg, var(--bg-input) ${(item.ratioPercent / 100) * 360}deg 360deg)` }}>
                                    <div className="mini-pie-center">{item.ratioPercent}%</div>
                                </div>
                                <div className="agent-pie-meta">
                                    <div className="agent-pie-name">{item.salesName}</div>
                                    <div className="agent-pie-ratio">{item.surveyedLeads}/{item.totalLeads} surveyed</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            {analytics.statusPie.items.length > 0 ? (
                <section className="dash-section">
                    <h2 className="section-title">Sales Status Breakdown</h2>
                    <div className="card">
                        <div className="pie-layout">
                            <div className="pie-chart" style={{ background: statusPieGradient }}>
                                <div className="pie-chart-center">
                                    <strong>{analytics.statusPie.total}</strong>
                                    <span>Total</span>
                                </div>
                            </div>
                            <div className="pie-legend">
                                {analytics.statusPie.items.map((item) => (
                                    <div key={item.key} className="pie-legend-row">
                                        <span className="pie-legend-left">
                                            <span className="pie-dot" style={{ background: STATUS_COLOR_MAP[item.key] || 'var(--primary-light)' }} />
                                            <span>{getSalesStatusLabel(item.key)}</span>
                                        </span>
                                        <span>{item.percentage}% ({item.count})</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
            ) : null}

            {isAdmin ? (
                <section className="dash-section">
                    <h2 className="section-title">Domisili Leads</h2>
                    <div className="card chart-card">
                        {analytics.domicileBars.length === 0 ? (
                            <div className="empty-desc">Belum ada data domisili.</div>
                        ) : analytics.domicileBars.map((item) => (
                            <div key={item.city} className="chart-row">
                                <div className="chart-row-head">
                                    <span>{item.city}</span>
                                    <span>{item.percentage}% ({item.count})</span>
                                </div>
                                <div className="chart-track">
                                    <div
                                        className="chart-fill"
                                        style={{
                                            width: `${Math.max(item.percentage, item.count > 0 ? 2 : 0)}%`,
                                            background: 'var(--warm)',
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            <section className="dash-section">
                <h2 className="section-title">Ongoing Appointment (Mau Survey)</h2>
                <div className="card-list">
                    {analytics.ongoingAppointments.length === 0 ? (
                        <div className="card">Belum ada appointment yang mau survey.</div>
                    ) : analytics.ongoingAppointments.map((item) => (
                        <div key={item.id} className="card card-clickable appt-card" onClick={() => router.push(`/leads/${item.leadId}`)}>
                            <div className="lead-row-top">
                                <div className="lead-row-name">{item.leadName}</div>
                                <span className="badge badge-warm">Mau Survey</span>
                            </div>
                            <div className="lead-row-meta">
                                <span>📅 {item.date}</span>
                                <span>🕐 {item.time}</span>
                            </div>
                            <div className="lead-row-meta">
                                <span>📍 {item.location}</span>
                                {isAdmin ? <span>👤 {item.salesName || '-'}</span> : null}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="dash-section">
                <h2 className="section-title">Result Status Recap</h2>
                <div className="card chart-card">
                    {analytics.resultRecap.items.map((item) => (
                        <div key={item.key} className="chart-row">
                            <div className="chart-row-head">
                                <span>{getResultStatusLabel(item.key)}</span>
                                <span>{item.percentage}% ({item.count})</span>
                            </div>
                            <div className="chart-track">
                                <div
                                    className="chart-fill"
                                    style={{
                                        width: `${Math.max(item.percentage, item.count > 0 ? 2 : 0)}%`,
                                        background: item.key === 'closing' ? 'var(--success)' : item.key === 'batal' ? 'var(--danger)' : 'var(--primary)',
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {analytics.resultRecap.cancelReasons.total > 0 ? (
                <section className="dash-section">
                    <h2 className="section-title">Alasan Batal</h2>
                    <div className="card chart-card">
                        {analytics.resultRecap.cancelReasons.items.map((item) => (
                            <div key={item.key} className="chart-row">
                                <div className="chart-row-head">
                                    <span>{getRejectedReasonLabel(item.key)}</span>
                                    <span>{item.percentage}% ({item.count})</span>
                                </div>
                                <div className="chart-track">
                                    <div
                                        className="chart-fill"
                                        style={{
                                            width: `${Math.max(item.percentage, item.count > 0 ? 2 : 0)}%`,
                                            background: 'var(--danger)',
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}
        </div>
    );
}
