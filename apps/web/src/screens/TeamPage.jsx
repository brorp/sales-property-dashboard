'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import Header from '../components/Header';
import { apiRequest } from '../lib/api';

const initialForm = {
    name: '',
    email: '',
    phone: '',
    password: '',
    queueOrder: '',
    queueLabel: '',
};

function TeamSummaryCard({ label, value, tone = 'default', helper }) {
    return (
        <div className={`team-summary-card team-summary-${tone}`}>
            <span className="team-summary-label">{label}</span>
            <strong className="team-summary-value">{value}</strong>
            {helper ? <span className="team-summary-helper">{helper}</span> : null}
        </div>
    );
}

function MemberStats({ member }) {
    return (
        <div className="team-member-stats">
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
    );
}

function MemberButton({ member, subtitle, metaBadge, onClick, compact = false }) {
    return (
        <button
            type="button"
            className={`team-member-trigger ${compact ? 'team-member-trigger-compact' : ''}`}
            onClick={onClick}
        >
            <div className="team-member-main">
                <div className={`team-avatar ${compact ? 'team-avatar-sm' : ''}`}>
                    {String(member?.name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="team-member-copy">
                    <div className="team-member-title-row">
                        <h3 className="team-name">{member.name}</h3>
                        {metaBadge ? <span className="badge badge-purple">{metaBadge}</span> : null}
                    </div>
                    <p className="team-email">{member.email}</p>
                    {subtitle ? <p className="team-member-subtitle">{subtitle}</p> : null}
                </div>
            </div>
            <span className="team-member-arrow">→</span>
        </button>
    );
}

export default function TeamPage() {
    const { isAdmin, user, getRoleLabel } = useAuth();
    const { teamStats, refreshTeamStats, createSalesUser } = useLeads();
    const router = useRouter();
    const [refreshing, setRefreshing] = useState(false);
    const [createModal, setCreateModal] = useState(null);
    const [form, setForm] = useState(initialForm);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [submitSuccess, setSubmitSuccess] = useState('');
    const [editingMember, setEditingMember] = useState(null);
    const [editForm, setEditForm] = useState({ name: '', phone: '' });
    const [editLoading, setEditLoading] = useState(false);
    const [editError, setEditError] = useState('');

    useEffect(() => {
        if (!isAdmin) {
            return;
        }

        void refreshTeamStats();
    }, [isAdmin, refreshTeamStats]);

    if (!isAdmin) {
        return null;
    }

    const canCreateSupervisor = user?.role === 'client_admin';
    const canCreateSales = user?.role === 'supervisor';
    const canEditMembers = user?.role === 'client_admin';
    const summary = teamStats?.summary || {
        supervisors: 0,
        sales: 0,
        totalLeads: 0,
        closed: 0,
        hot: 0,
        pending: 0,
    };

    const groups = Array.isArray(teamStats?.groups) ? teamStats.groups : [];
    const activeClientId = groups[0]?.clientId || null;
    const showClientHeader = user?.role === 'root_admin' || groups.length > 1;
    const overviewCards = useMemo(() => ([
        {
            key: 'supervisors',
            label: 'Supervisors',
            value: summary.supervisors || 0,
            tone: 'hot',
            helper: `${summary.sales || 0} sales aktif`,
        },
        {
            key: 'sales',
            label: 'Sales',
            value: summary.sales || 0,
            tone: 'warm',
            helper: `${summary.totalLeads || 0} leads terkelola`,
        },
        {
            key: 'closing',
            label: 'Closing',
            value: summary.closed || 0,
            tone: 'success',
            helper: `${summary.hot || 0} leads hot`,
        },
        {
            key: 'pending',
            label: 'Pending',
            value: summary.pending || 0,
            tone: 'default',
            helper: 'Perlu follow up',
        },
    ]), [summary.closed, summary.hot, summary.pending, summary.sales, summary.supervisors, summary.totalLeads]);

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await refreshTeamStats();
        } finally {
            setRefreshing(false);
        }
    };

    const handleCreateSales = async (event) => {
        event.preventDefault();
        if (!form.name || !form.email || !form.password) {
            return;
        }

        setSubmitLoading(true);
        setSubmitError('');
        setSubmitSuccess('');

        try {
            if (createModal?.mode === 'supervisor') {
                if (!activeClientId) {
                    throw new Error('Client tidak ditemukan untuk membuat supervisor');
                }

                await apiRequest(`/api/clients/${activeClientId}/users`, {
                    method: 'POST',
                    user,
                    body: {
                        name: form.name.trim(),
                        email: form.email.trim().toLowerCase(),
                        password: form.password,
                        role: 'supervisor',
                        phone: form.phone.trim() || null,
                    },
                });
            } else {
                await createSalesUser({
                    name: form.name.trim(),
                    email: form.email.trim().toLowerCase(),
                    password: form.password,
                    phone: form.phone.trim() || null,
                    queueOrder: form.queueOrder ? Number(form.queueOrder) : null,
                    queueLabel: form.queueLabel.trim() || null,
                    supervisorId: createModal?.supervisorId || null,
                });
            }
            setForm(initialForm);
            setCreateModal(null);
            setSubmitSuccess(
                createModal?.mode === 'supervisor'
                    ? 'Supervisor berhasil ditambahkan.'
                    : 'Sales user created successfully.'
            );
            await refreshTeamStats();
        } catch (err) {
            setSubmitError(
                err instanceof Error
                    ? err.message
                    : createModal?.mode === 'supervisor'
                        ? 'Failed creating supervisor'
                        : 'Failed creating sales user'
            );
        } finally {
            setSubmitLoading(false);
        }
    };

    const openCreateSupervisor = () => {
        setCreateModal({ mode: 'supervisor' });
        setForm({
            ...initialForm,
            password: 'admin123',
        });
        setSubmitError('');
        setSubmitSuccess('');
    };

    const openCreateSales = (supervisor) => {
        setCreateModal({
            mode: 'sales',
            supervisorId: supervisor?.id || null,
            supervisorName: supervisor?.name || '',
        });
        setForm({
            ...initialForm,
            password: 'sales123',
        });
        setSubmitError('');
        setSubmitSuccess('');
    };

    const closeCreateModal = () => {
        setCreateModal(null);
        setForm(initialForm);
        setSubmitError('');
        setSubmitLoading(false);
    };

    const openEditMember = (member) => {
        if (!member?.id || !member?.clientId) {
            return;
        }

        setEditingMember(member);
        setEditForm({
            name: member.name || '',
            phone: member.phone || '',
        });
        setEditError('');
        setSubmitSuccess('');
    };

    const closeEditMember = () => {
        setEditingMember(null);
        setEditForm({ name: '', phone: '' });
        setEditError('');
        setEditLoading(false);
    };

    const handleUpdateMember = async (event) => {
        event.preventDefault();
        if (!user || !editingMember?.id || !editingMember?.clientId || !editForm.name.trim()) {
            return;
        }

        setEditLoading(true);
        setEditError('');
        setSubmitSuccess('');

        try {
            await apiRequest(`/api/clients/${editingMember.clientId}/users/${editingMember.id}`, {
                method: 'PATCH',
                user,
                body: {
                    name: editForm.name.trim(),
                    phone: editForm.phone.trim() ? editForm.phone.trim() : null,
                },
            });
            await refreshTeamStats();
            setSubmitSuccess(`${editingMember.role === 'supervisor' ? 'Supervisor' : 'Sales'} berhasil diperbarui.`);
            closeEditMember();
        } catch (err) {
            setEditError(err instanceof Error ? err.message : 'Failed updating team member');
            setEditLoading(false);
        }
    };

    const goToMemberDetail = (memberId) => {
        if (!memberId) {
            return;
        }

        router.push(`/team/${memberId}`);
    };

    return (
        <div className="page-container">
            <Header
                title={`Kelola Tim ${getRoleLabel(user?.role)}`}
                rightAction={(
                    <>
                        <button className="btn btn-sm btn-secondary" onClick={() => void handleRefresh()} disabled={refreshing}>
                            {refreshing ? 'Loading...' : 'Refresh'}
                        </button>
                        {canCreateSupervisor ? (
                            <button className="btn btn-sm btn-primary" onClick={openCreateSupervisor}>
                                + Supervisor
                            </button>
                        ) : null}
                        {canCreateSales ? (
                            <button className="btn btn-sm btn-primary" onClick={() => openCreateSales(null)}>
                                + Sales
                            </button>
                        ) : null}
                    </>
                )}
            />

            {user?.role === 'root_admin' ? (
                <div className="settings-help">
                    Root Admin melihat struktur seluruh client. Pembuatan sales tetap dilakukan dari level client admin atau supervisor.
                </div>
            ) : null}

            {submitSuccess ? <div className="settings-success">{submitSuccess}</div> : null}

            <section className="team-overview-grid">
                {overviewCards.map((item) => (
                    <TeamSummaryCard
                        key={item.key}
                        label={item.label}
                        value={item.value}
                        tone={item.tone}
                        helper={item.helper}
                    />
                ))}
            </section>

            <div className="team-list">
                {groups.length === 0 ? (
                    <div className="card">
                        <p className="team-empty-title">Belum ada struktur tim.</p>
                        <p className="team-empty-copy">Supervisor dan sales yang aktif akan tampil di halaman ini.</p>
                    </div>
                ) : null}

                {groups.map((group) => (
                    <section key={group.id} className="card team-group-shell">
                        {showClientHeader ? (
                            <div className="team-group-header">
                                <div>
                                    <span className="team-group-kicker">Client Workspace</span>
                                    <h2 className="team-group-title">{group.clientName}</h2>
                                </div>
                                <div className="team-group-summary">
                                    <span className="badge badge-purple">{group.summary?.supervisors || 0} Supervisor</span>
                                    <span className="badge badge-warm">{group.summary?.sales || 0} Sales</span>
                                </div>
                            </div>
                        ) : null}

                        <div className="team-hierarchy">
                            {Array.isArray(group.supervisors) && group.supervisors.map((supervisor) => (
                                <article key={supervisor.id} className="team-hierarchy-card">
                                    <div className="team-member-row">
                                        <MemberButton
                                            member={supervisor}
                                            subtitle={supervisor.phone || 'Belum ada nomor WhatsApp'}
                                            metaBadge={`${supervisor.salesCount || 0} Sales`}
                                            onClick={() => goToMemberDetail(supervisor.id)}
                                        />
                                        <div className="team-member-action-stack">
                                            {canEditMembers ? (
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-secondary team-edit-btn"
                                                    onClick={() => openEditMember(supervisor)}
                                                >
                                                    Edit
                                                </button>
                                            ) : null}
                                            {canCreateSupervisor ? (
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-primary team-edit-btn"
                                                    onClick={() => openCreateSales(supervisor)}
                                                >
                                                    + Sales
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>

                                    <MemberStats member={supervisor} />

                                    {Array.isArray(supervisor.sales) && supervisor.sales.length > 0 ? (
                                        <div className="team-children-list">
                                            {supervisor.sales.map((sales) => (
                                                <div key={sales.id} className="team-child-row">
                                                    <div className="team-member-row">
                                                        <MemberButton
                                                            member={sales}
                                                            subtitle={`${sales.phone || 'Belum ada nomor WhatsApp'} • ${sales.totalLeads || 0} leads • ${sales.closed || 0} closing`}
                                                            metaBadge="Sales"
                                                            onClick={() => goToMemberDetail(sales.id)}
                                                            compact
                                                        />
                                                        <div className="team-member-action-stack">
                                                            {canEditMembers ? (
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-sm btn-secondary team-edit-btn"
                                                                    onClick={() => openEditMember(sales)}
                                                                >
                                                                    Edit
                                                                </button>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="team-empty-subtree">Supervisor ini belum punya sales aktif.</div>
                                    )}
                                </article>
                            ))}

                            {Array.isArray(group.unassignedSales) && group.unassignedSales.length > 0 ? (
                                <article className="team-hierarchy-card team-unassigned-shell">
                                    <div className="team-unassigned-head">
                                        <div>
                                            <span className="team-group-kicker">Belum punya supervisor</span>
                                            <h3 className="team-group-title">Sales tanpa supervisor</h3>
                                        </div>
                                        <span className="badge badge-neutral">{group.unassignedSales.length} Sales</span>
                                    </div>

                                    <div className="team-children-list">
                                        {group.unassignedSales.map((sales) => (
                                            <div key={sales.id} className="team-child-row">
                                                <div className="team-member-row">
                                                    <MemberButton
                                                        member={sales}
                                                        subtitle={`${sales.phone || 'Belum ada nomor WhatsApp'} • ${sales.totalLeads || 0} leads • ${sales.closed || 0} closing`}
                                                        metaBadge="Sales"
                                                        onClick={() => goToMemberDetail(sales.id)}
                                                        compact
                                                    />
                                                    <div className="team-member-action-stack">
                                                        {canEditMembers ? (
                                                            <button
                                                                type="button"
                                                                className="btn btn-sm btn-secondary team-edit-btn"
                                                                onClick={() => openEditMember(sales)}
                                                            >
                                                                Edit
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </article>
                            ) : null}
                        </div>
                    </section>
                ))}
            </div>

            {createModal ? (
                <div className="modal-overlay" onClick={(event) => { if (event.target === event.currentTarget) closeCreateModal(); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>
                            {createModal.mode === 'supervisor'
                                ? '➕ Tambah Supervisor Baru'
                                : `➕ Tambah Sales${createModal.supervisorName ? ` untuk ${createModal.supervisorName}` : ''}`}
                        </h2>
                        <form onSubmit={handleCreateSales} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div className="input-group">
                                <label>Nama</label>
                                <input className="input-field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
                            </div>
                            <div className="input-group">
                                <label>Email</label>
                                <input type="email" className="input-field" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
                            </div>
                            <div className="input-group">
                                <label>No WhatsApp</label>
                                <input className="input-field" placeholder="08xxxx / +62xxxx" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                            </div>
                            <div className="input-group">
                                <label>Password</label>
                                <input className="input-field" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
                            </div>
                            {createModal.mode === 'sales' ? (
                                <>
                                    <div className="input-group">
                                        <label>Queue Order (optional)</label>
                                        <input type="number" min={1} className="input-field" value={form.queueOrder} onChange={(event) => setForm({ ...form, queueOrder: event.target.value })} />
                                    </div>
                                    <div className="input-group">
                                        <label>Queue Label (optional)</label>
                                        <input className="input-field" value={form.queueLabel} onChange={(event) => setForm({ ...form, queueLabel: event.target.value })} />
                                    </div>
                                </>
                            ) : null}
                            {submitError ? <div className="login-error">{submitError}</div> : null}
                            <button type="submit" className="btn btn-primary btn-full" disabled={submitLoading}>
                                {submitLoading
                                    ? 'Creating...'
                                    : createModal.mode === 'supervisor'
                                        ? 'Create Supervisor'
                                        : 'Create Sales'}
                            </button>
                            <button type="button" className="btn btn-secondary btn-full" onClick={closeCreateModal}>Batal</button>
                        </form>
                    </div>
                </div>
            ) : null}

            {editingMember ? (
                <div className="modal-overlay" onClick={(event) => { if (event.target === event.currentTarget) closeEditMember(); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>✏️ Edit {editingMember.role === 'supervisor' ? 'Supervisor' : 'Sales'}</h2>
                        <form onSubmit={handleUpdateMember} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div className="input-group">
                                <label>Nama</label>
                                <input
                                    className="input-field"
                                    value={editForm.name}
                                    onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                                    required
                                />
                            </div>
                            <div className="input-group">
                                <label>No WhatsApp</label>
                                <input
                                    className="input-field"
                                    placeholder="08xxxx / +62xxxx"
                                    value={editForm.phone}
                                    onChange={(event) => setEditForm((prev) => ({ ...prev, phone: event.target.value }))}
                                />
                            </div>
                            {editError ? <div className="login-error">{editError}</div> : null}
                            <button type="submit" className="btn btn-primary btn-full" disabled={editLoading}>
                                {editLoading ? 'Menyimpan...' : 'Simpan Perubahan'}
                            </button>
                            <button type="button" className="btn btn-secondary btn-full" onClick={closeEditMember} disabled={editLoading}>
                                Batal
                            </button>
                        </form>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
