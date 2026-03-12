'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { getFlowStatusLabel, getResultStatusLabel, getSalesStatusLabel, getTimeAgo } from '../constants/crm';
import { apiRequest } from '../lib/api';

function getStatusBadgeClass(kind, value) {
    if (kind === 'flow') {
        if (value === 'assigned') return 'badge-purple';
        if (value === 'hold') return 'badge-warm';
        return 'badge-neutral';
    }

    if (kind === 'sales') {
        if (value === 'hot') return 'badge-hot';
        if (value === 'warm') return 'badge-warm';
        if (value === 'cold') return 'badge-cold';
        return 'badge-neutral';
    }

    if (value === 'closing') return 'badge-success';
    if (value === 'batal') return 'badge-danger';
    return 'badge-purple';
}

export default function TeamMemberDetailPage({ memberId }) {
    const { user } = useAuth();
    const router = useRouter();
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    const loadDetail = useCallback(async (options = { silent: false }) => {
        if (!user || !memberId) {
            setLoading(false);
            return;
        }

        if (options.silent) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        try {
            const data = await apiRequest(`/api/team/${memberId}`, { user });
            setDetail(data || null);
            setError('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed loading team member detail');
        } finally {
            if (options.silent) {
                setRefreshing(false);
            } else {
                setLoading(false);
            }
        }
    }, [memberId, user]);

    useEffect(() => {
        void loadDetail();
    }, [loadDetail]);

    const member = detail?.member || null;
    const managedSales = Array.isArray(detail?.managedSales) ? detail.managedSales : [];
    const leads = Array.isArray(detail?.leads) ? detail.leads : [];

    return (
        <div className="page-container">
            <Header
                title={member ? `${member.roleLabel} Detail` : 'Detail Tim'}
                showBack
                rightAction={(
                    <button className="btn btn-sm btn-secondary" onClick={() => void loadDetail({ silent: true })} disabled={loading || refreshing}>
                        {loading || refreshing ? 'Loading...' : 'Refresh'}
                    </button>
                )}
            />

            {error ? <div className="settings-error">{error}</div> : null}

            {member ? (
                <>
                    <section className="card team-detail-hero">
                        <div className="team-detail-hero-top">
                            <div className="team-member-main">
                                <div className="team-avatar team-detail-avatar">
                                    {String(member.name || '?').charAt(0).toUpperCase()}
                                </div>
                                <div className="team-member-copy">
                                    <div className="team-member-title-row">
                                        <h2 className="team-detail-title">{member.name}</h2>
                                        <span className="badge badge-purple">{member.roleLabel}</span>
                                        <span className={`badge ${member.isActive ? 'badge-success' : 'badge-danger'}`}>
                                            {member.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                    <p className="team-email">{member.email}</p>
                                    <p className="team-member-subtitle">{member.clientName || 'Tanpa client'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="team-detail-meta-grid">
                            <div className="team-detail-meta-item">
                                <span className="team-detail-meta-label">WhatsApp</span>
                                <strong>{member.phone || '-'}</strong>
                            </div>
                            <div className="team-detail-meta-item">
                                <span className="team-detail-meta-label">Supervisor</span>
                                <strong>{member.supervisorName || '-'}</strong>
                            </div>
                            <div className="team-detail-meta-item">
                                <span className="team-detail-meta-label">Created By</span>
                                <strong>{member.createdByName || '-'}</strong>
                            </div>
                            <div className="team-detail-meta-item">
                                <span className="team-detail-meta-label">Managed Sales</span>
                                <strong>{member.managedSalesCount || 0}</strong>
                            </div>
                        </div>

                        <div className="team-member-stats team-detail-stats">
                            <div className="team-member-stat">
                                <span className="team-member-stat-value">{member.totalLeads || 0}</span>
                                <span className="team-member-stat-label">Leads</span>
                            </div>
                            <div className="team-member-stat">
                                <span className="team-member-stat-value">{member.closed || 0}</span>
                                <span className="team-member-stat-label">Closing</span>
                            </div>
                            <div className="team-member-stat">
                                <span className="team-member-stat-value">{member.hot || 0}</span>
                                <span className="team-member-stat-label">Hot</span>
                            </div>
                            <div className="team-member-stat">
                                <span className="team-member-stat-value">{member.pending || 0}</span>
                                <span className="team-member-stat-label">Pending</span>
                            </div>
                        </div>
                    </section>

                    {managedSales.length > 0 ? (
                        <section className="card team-detail-section">
                            <div className="team-detail-section-head">
                                <div>
                                    <span className="team-group-kicker">Hierarchy</span>
                                    <h3 className="team-group-title">Sales di bawah {member.name}</h3>
                                </div>
                                <span className="badge badge-purple">{managedSales.length} Sales</span>
                            </div>

                            <div className="team-children-list team-detail-sales-list">
                                {managedSales.map((sales) => (
                                    <div key={sales.id} className="team-child-row">
                                        <button
                                            type="button"
                                            className="team-member-trigger team-member-trigger-compact"
                                            onClick={() => router.push(`/team/${sales.id}`)}
                                        >
                                            <div className="team-member-main">
                                                <div className="team-avatar team-avatar-sm">
                                                    {String(sales.name || '?').charAt(0).toUpperCase()}
                                                </div>
                                                <div className="team-member-copy">
                                                    <div className="team-member-title-row">
                                                        <h4 className="team-name">{sales.name}</h4>
                                                        <span className="badge badge-neutral">{sales.totalLeads || 0} Leads</span>
                                                    </div>
                                                    <p className="team-email">{sales.email}</p>
                                                    <p className="team-member-subtitle">{sales.closed || 0} closing • {sales.hot || 0} hot</p>
                                                </div>
                                            </div>
                                            <span className="team-member-arrow">→</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ) : null}

                    <section className="team-detail-section">
                        <div className="team-detail-section-head">
                            <div>
                                <span className="team-group-kicker">Owned Leads</span>
                                <h3 className="team-group-title">Daftar Lead</h3>
                            </div>
                            <span className="badge badge-warm">{leads.length} Leads</span>
                        </div>

                        <div className="card-list">
                            {leads.length === 0 ? (
                                <div className="card">
                                    <p className="team-empty-title">Belum ada lead.</p>
                                    <p className="team-empty-copy">Lead yang dimiliki user ini akan tampil di sini.</p>
                                </div>
                            ) : leads.map((lead) => (
                                <div
                                    key={lead.id}
                                    className="card card-clickable team-lead-card"
                                    onClick={() => router.push(`/leads/${lead.id}`)}
                                >
                                    <div className="lead-row-top">
                                        <div className="lead-row-name">{lead.name}</div>
                                        <span className="lead-row-ago">{getTimeAgo(lead.createdAt)}</span>
                                    </div>
                                    <div className="lead-row-meta">
                                        <span>📱 {lead.phone}</span>
                                        <span>📣 {lead.source}</span>
                                    </div>
                                    <div className="team-lead-badges">
                                        <span className={`badge ${getStatusBadgeClass('flow', lead.flowStatus)}`}>
                                            {getFlowStatusLabel(lead.flowStatus || 'open')}
                                        </span>
                                        {lead.salesStatus ? (
                                            <span className={`badge ${getStatusBadgeClass('sales', lead.salesStatus)}`}>
                                                {getSalesStatusLabel(lead.salesStatus)}
                                            </span>
                                        ) : null}
                                        {lead.resultStatus ? (
                                            <span className={`badge ${getStatusBadgeClass('result', lead.resultStatus)}`}>
                                                {getResultStatusLabel(lead.resultStatus)}
                                            </span>
                                        ) : null}
                                    </div>
                                    {member.role !== 'sales' ? (
                                        <div className="lead-row-meta">
                                            <span>Assigned Sales: {lead.assignedUserName || '-'}</span>
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    </section>
                </>
            ) : null}

            {!member && !loading && !error ? (
                <div className="card">
                    <p className="team-empty-title">Member tidak ditemukan.</p>
                    <p className="team-empty-copy">Coba kembali ke halaman team lalu pilih ulang user yang ingin dilihat.</p>
                </div>
            ) : null}
        </div>
    );
}
