'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import Header from '../components/Header';
import { apiRequest } from '../lib/api';
import { downloadLeadTransferWorkbook } from '../lib/lead-transfer-workbook';
import { usePagePolling } from '../hooks/usePagePolling';
import { useTenant } from '../context/TenantContext';

const initialForm = {
    name: '',
    email: '',
    phone: '',
    password: '',
    supervisorId: '',
    queueOrder: '',
    queueLabel: '',
};

const LOCKED_TEAM_MEMBER_EMAILS = new Set([
    'supervisor.picagent@widari.propertylounge.id',
    'picagent@gmail.com',
]);

function isLockedTeamMember(member) {
    const email = String(member?.email || '').trim().toLowerCase();
    return LOCKED_TEAM_MEMBER_EMAILS.has(email);
}

function sortMembersWithLockedLast(items = []) {
    return [...items].sort((a, b) => {
        const aLocked = isLockedTeamMember(a);
        const bLocked = isLockedTeamMember(b);

        if (aLocked !== bLocked) {
            return aLocked ? 1 : -1;
        }

        return String(a?.name || '').localeCompare(String(b?.name || ''));
    });
}

function formatSuspensionUntil(value) {
    if (!value) {
        return '-';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return '-';
    }

    return parsed.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function getTeamActionErrorMessage(error, fallback) {
    if (!(error instanceof Error)) {
        return fallback;
    }

    switch (error.message) {
        case 'INVALID_SUPERVISOR':
            return 'Supervisor tujuan tidak valid atau sudah nonaktif.';
        case 'SUPERVISOR_HAS_ACTIVE_SALES':
            return 'Supervisor masih punya sales aktif. Pindahkan atau nonaktifkan sales aktifnya terlebih dahulu.';
        case 'TEAM_MEMBER_NOT_FOUND':
            return 'Member tim tidak ditemukan atau sudah tidak aktif.';
        case 'TARGET_SALES_NOT_FOUND':
            return 'Sales yang mau dipindahkan tidak ditemukan pada workspace ini.';
        case 'ADMIN_PASSWORD_REQUIRED':
            return 'Password admin wajib diisi.';
        case 'ADMIN_PASSWORD_INVALID':
            return 'Password admin tidak valid.';
        default:
            return error.message;
    }
}

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
                <span className="team-member-stat-value">{member.accepted || 0}</span>
                <span className="team-member-stat-label">Accepted</span>
            </div>
            <div className="team-member-stat">
                <span className="team-member-stat-value">{member.closed || 0}</span>
                <span className="team-member-stat-label">Closing</span>
            </div>
            <div className="team-member-stat">
                <span className="team-member-stat-value">{member.appointments || 0}</span>
                <span className="team-member-stat-label">Appointment</span>
            </div>
        </div>
    );
}

function MemberButton({ member, subtitle, metaBadge, onClick, compact = false, interactive = true }) {
    const Container = interactive ? 'button' : 'div';
    const isSuspended = Boolean(member?.isSuspended && member?.suspension);

    return (
        <Container
            {...(interactive ? { type: 'button', onClick } : {})}
            className={`team-member-trigger ${compact ? 'team-member-trigger-compact' : ''}`}
        >
            <div className="team-member-main">
                <div className={`team-avatar ${compact ? 'team-avatar-sm' : ''}`}>
                    {String(member?.name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="team-member-copy">
                    <div className="team-member-title-row">
                        <h3 className="team-name">{member.name}</h3>
                        {metaBadge ? <span className="badge badge-purple">{metaBadge}</span> : null}
                        {isSuspended ? <span className="badge badge-danger">Suspended</span> : null}
                        {isSuspended ? <span className="badge badge-neutral">Layer {member.suspension?.penaltyLayer || '-'}</span> : null}
                    </div>
                    <p className="team-email">{member.email}</p>
                    {subtitle ? <p className="team-member-subtitle">{subtitle}</p> : null}
                    {isSuspended ? (
                        <p className="team-member-alert">
                            Queue nonaktif sampai {formatSuspensionUntil(member.suspension?.suspendedUntil)}
                        </p>
                    ) : null}
                </div>
            </div>
            {interactive ? <span className="team-member-arrow">→</span> : null}
        </Container>
    );
}

export default function TeamPage() {
    const { isAdmin, user, getRoleLabel } = useAuth();
    const { teamStats, refreshTeamStats, createSalesUser } = useLeads();
    const { tenant } = useTenant();
    const router = useRouter();
    const [refreshing, setRefreshing] = useState(false);
    const [createModal, setCreateModal] = useState(null);
    const [form, setForm] = useState(initialForm);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [submitSuccess, setSubmitSuccess] = useState('');
    const [editingMember, setEditingMember] = useState(null);
    const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', password: '' });
    const [editLoading, setEditLoading] = useState(false);
    const [editError, setEditError] = useState('');
    const [lifecycleState, setLifecycleState] = useState(null);
    const [assignmentState, setAssignmentState] = useState(null);
    const [deleteSupervisorState, setDeleteSupervisorState] = useState(null);

    useEffect(() => {
        if (!isAdmin) {
            return;
        }

        void refreshTeamStats();
    }, [isAdmin, refreshTeamStats]);

    usePagePolling({
        enabled: Boolean(isAdmin && user),
        intervalMs: 3000,
        run: useCallback(async () => {
            await refreshTeamStats();
        }, [refreshTeamStats]),
    });
    const groups = Array.isArray(teamStats?.groups) ? teamStats.groups : [];
    const availableSupervisors = useMemo(() => {
        return groups
            .flatMap((group) => Array.isArray(group.supervisors) ? group.supervisors : [])
            .filter((supervisor) => !isLockedTeamMember(supervisor))
            .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
    }, [groups]);
    const supervisorOptionsByClient = useMemo(() => {
        const nextMap = new Map();

        for (const group of groups) {
            nextMap.set(
                group.clientId || 'no-client',
                sortMembersWithLockedLast(group.supervisors || []).filter((supervisor) => !isLockedTeamMember(supervisor)),
            );
        }

        return nextMap;
    }, [groups]);

    const canCreateSupervisor = user?.role === 'client_admin';
    const canCreateSales =
        user?.role === 'supervisor' ||
        (user?.role === 'client_admin' && availableSupervisors.length > 0);
    const canEditMembers = user?.role === 'client_admin';
    const canManageSalesLifecycle = user?.role === 'client_admin' || user?.role === 'root_admin';
    const canManageSalesSupervisor = user?.role === 'client_admin' || user?.role === 'root_admin';
    const summary = teamStats?.summary || {
        supervisors: 0,
        sales: 0,
        totalLeads: 0,
        accepted: 0,
        closed: 0,
        hot: 0,
        pending: 0,
        appointments: 0,
        suspendedSales: 0,
    };
    const activeClientId =
        tenant?.id ||
        (user?.role === 'client_admin' ? user?.clientId : null) ||
        groups[0]?.clientId ||
        null;
    const showClientHeader = user?.role === 'root_admin' || groups.length > 1;
    const overviewCards = [
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
            key: 'appointments',
            label: 'Appointments',
            value: summary.appointments || 0,
            tone: 'default',
            helper: `${summary.accepted || 0} accepted`,
        },
        ...(summary.suspendedSales ? [{
            key: 'suspended',
            label: 'Suspended',
            value: summary.suspendedSales || 0,
            tone: 'hot',
            helper: 'Queue distribusi sedang diblok',
        }] : []),
    ];

    if (!isAdmin) {
        return null;
    }

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await refreshTeamStats();
        } finally {
            setRefreshing(false);
        }
    };

    const openDeactivateMember = (member) => {
        setSubmitError('');
        setLifecycleState({
            member,
            step: 'export',
            exporting: false,
            submitting: false,
            error: '',
            exportedCount: null,
            accessCode: '',
            passwordConfirmation: '',
        });
        setSubmitSuccess('');
    };

    const closeLifecycleModal = () => {
        setLifecycleState(null);
    };

    const handleExportSalesLeads = async () => {
        if (!user || !lifecycleState?.member?.id) {
            return;
        }

        if (!String(lifecycleState.accessCode || '').trim()) {
            setLifecycleState((prev) => (prev ? {
                ...prev,
                error: 'Access code export wajib diisi sebelum export.',
            } : prev));
            return;
        }

        setLifecycleState((prev) => (prev ? { ...prev, exporting: true, error: '' } : prev));

        try {
            const exported = await apiRequest(`/api/sales/${lifecycleState.member.id}/leads/export`, {
                method: 'POST',
                user,
                body: {
                    accessCode: lifecycleState.accessCode.trim(),
                },
            });
            await downloadLeadTransferWorkbook({
                fileName: exported.fileName,
                rows: exported.rows || [],
            });

            setLifecycleState((prev) => (prev ? {
                ...prev,
                exporting: false,
                step: 'confirm',
                exportedCount: exported.exportedCount || 0,
                passwordConfirmation: '',
            } : prev));
        } catch (err) {
            setLifecycleState((prev) => (prev ? {
                ...prev,
                exporting: false,
                error: err instanceof Error ? err.message : 'Gagal export leads sales',
            } : prev));
        }
    };

    const handleConfirmDeactivate = async () => {
        if (!user || !lifecycleState?.member?.id) {
            return;
        }

        if (!String(lifecycleState.passwordConfirmation || '').trim()) {
            setLifecycleState((prev) => (prev ? {
                ...prev,
                error: 'Password admin wajib diisi untuk menonaktifkan sales.',
            } : prev));
            return;
        }

        setLifecycleState((prev) => (prev ? { ...prev, submitting: true, error: '' } : prev));

        try {
            await apiRequest(`/api/sales/${lifecycleState.member.id}/deactivate`, {
                method: 'POST',
                user,
                body: {
                    passwordConfirmation: lifecycleState.passwordConfirmation || '',
                },
            });
            await refreshTeamStats();
            setSubmitSuccess(`Sales ${lifecycleState.member.name} berhasil dinonaktifkan.`);
            closeLifecycleModal();
        } catch (err) {
            setLifecycleState((prev) => (prev ? {
                ...prev,
                submitting: false,
                error: getTeamActionErrorMessage(err, 'Gagal menonaktifkan sales'),
            } : prev));
        }
    };

    const handleReactivateSales = async (member) => {
        if (!member?.id) {
            return;
        }

        const supervisorOptions = supervisorOptionsByClient.get(member.clientId || 'no-client') || [];

        if (supervisorOptions.length === 0) {
            setSubmitError('Tambahkan supervisor aktif terlebih dahulu sebelum mengaktifkan sales kembali.');
            return;
        }

        const hasCurrentSupervisor = supervisorOptions.some((supervisor) => supervisor.id === member.supervisorId);

        setAssignmentState({
            mode: 'reactivate',
            sales: member,
            clientId: member.clientId || null,
            supervisorId: hasCurrentSupervisor ? member.supervisorId || '' : supervisorOptions[0]?.id || '',
            error: '',
            submitting: false,
        });
        setSubmitSuccess('');
        setSubmitError('');
    };

    const openAssignSupervisor = (member) => {
        if (!member?.id) {
            return;
        }

        const supervisorOptions = supervisorOptionsByClient.get(member.clientId || 'no-client') || [];

        if (supervisorOptions.length === 0) {
            setSubmitError('Belum ada supervisor aktif untuk workspace sales ini.');
            return;
        }

        const hasCurrentSupervisor = supervisorOptions.some((supervisor) => supervisor.id === member.supervisorId);

        setAssignmentState({
            mode: 'assign',
            sales: member,
            clientId: member.clientId || null,
            supervisorId: hasCurrentSupervisor ? member.supervisorId || '' : supervisorOptions[0]?.id || '',
            error: '',
            submitting: false,
        });
        setSubmitSuccess('');
        setSubmitError('');
    };

    const closeAssignmentModal = () => {
        setAssignmentState(null);
    };

    const handleSubmitAssignment = async () => {
        if (!user || !assignmentState?.sales?.id || !assignmentState?.clientId) {
            return;
        }

        if (!assignmentState.supervisorId) {
            setAssignmentState((prev) => (prev ? {
                ...prev,
                error: 'Supervisor tujuan wajib dipilih.',
            } : prev));
            return;
        }

        setAssignmentState((prev) => (prev ? { ...prev, submitting: true, error: '' } : prev));

        try {
            if (assignmentState.mode === 'reactivate') {
                await apiRequest(`/api/sales/${assignmentState.sales.id}/reactivate`, {
                    method: 'POST',
                    user,
                    body: {
                        supervisorId: assignmentState.supervisorId,
                    },
                });
                setSubmitSuccess(`Sales ${assignmentState.sales.name} berhasil diaktifkan kembali.`);
            } else {
                await apiRequest('/api/sales/supervisor/assign', {
                    method: 'PATCH',
                    user,
                    body: {
                        salesIds: [assignmentState.sales.id],
                        supervisorId: assignmentState.supervisorId,
                        clientId: assignmentState.clientId,
                    },
                });
                setSubmitSuccess(`Supervisor untuk ${assignmentState.sales.name} berhasil diperbarui.`);
            }

            await refreshTeamStats();
            closeAssignmentModal();
        } catch (err) {
            setAssignmentState((prev) => (prev ? {
                ...prev,
                submitting: false,
                error: getTeamActionErrorMessage(err, 'Gagal memperbarui supervisor sales'),
            } : prev));
        }
    };

    const openDeleteSupervisor = (supervisor) => {
        if (!supervisor?.id) {
            return;
        }

        setDeleteSupervisorState({
            supervisor,
            submitting: false,
            error: '',
            passwordConfirmation: '',
        });
        setSubmitSuccess('');
        setSubmitError('');
    };

    const closeDeleteSupervisor = () => {
        setDeleteSupervisorState(null);
    };

    const handleDeleteSupervisor = async () => {
        if (!user || !deleteSupervisorState?.supervisor?.id) {
            return;
        }

        if (!String(deleteSupervisorState.passwordConfirmation || '').trim()) {
            setDeleteSupervisorState((prev) => (prev ? {
                ...prev,
                error: 'Password admin wajib diisi untuk menghapus supervisor.',
            } : prev));
            return;
        }

        setDeleteSupervisorState((prev) => (prev ? { ...prev, submitting: true, error: '' } : prev));

        try {
            await apiRequest(`/api/team/${deleteSupervisorState.supervisor.id}`, {
                method: 'DELETE',
                user,
                body: {
                    passwordConfirmation: deleteSupervisorState.passwordConfirmation || '',
                },
            });
            await refreshTeamStats();
            setSubmitSuccess(`Supervisor ${deleteSupervisorState.supervisor.name} berhasil dihapus.`);
            closeDeleteSupervisor();
        } catch (err) {
            setDeleteSupervisorState((prev) => (prev ? {
                ...prev,
                submitting: false,
                error: getTeamActionErrorMessage(err, 'Gagal menghapus supervisor'),
            } : prev));
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
                const targetSupervisorId =
                    user?.role === 'supervisor'
                        ? user.id
                        : createModal?.supervisorId || form.supervisorId || null;

                if (user?.role === 'client_admin' && !targetSupervisorId) {
                    throw new Error('Pilih supervisor terlebih dahulu untuk menambahkan sales');
                }

                await createSalesUser({
                    name: form.name.trim(),
                    email: form.email.trim().toLowerCase(),
                    password: form.password,
                    phone: form.phone.trim() || null,
                    queueOrder: form.queueOrder ? Number(form.queueOrder) : null,
                    queueLabel: form.queueLabel.trim() || null,
                    supervisorId: targetSupervisorId,
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
            supervisorId: supervisor?.id || '',
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
        if (!member?.id || !member?.clientId || isLockedTeamMember(member)) {
            return;
        }

        setEditingMember(member);
        setEditForm({
            name: member.name || '',
            phone: member.phone || '',
            email: member.email || '',
            password: '',
        });
        setEditError('');
        setSubmitSuccess('');
    };

    const closeEditMember = () => {
        setEditingMember(null);
        setEditForm({ name: '', phone: '', email: '', password: '' });
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
                    ...((editingMember.role === 'sales' || editingMember.role === 'supervisor')
                        ? {
                            email: editForm.email.trim().toLowerCase(),
                            password: editForm.password.trim() || undefined,
                        }
                        : {}),
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
            {submitError ? <div className="login-error">{submitError}</div> : null}

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
                            {sortMembersWithLockedLast(group.supervisors || []).map((supervisor) => (
                                <article key={supervisor.id} className="team-hierarchy-card">
                                    <div className="team-member-row">
                                        <MemberButton
                                            member={supervisor}
                                            subtitle={supervisor.phone || 'Belum ada nomor WhatsApp'}
                                            metaBadge={`${supervisor.salesCount || 0} Sales`}
                                            onClick={() => goToMemberDetail(supervisor.id)}
                                        />
                                        <div className="team-member-action-stack">
                                            {canEditMembers && !isLockedTeamMember(supervisor) ? (
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-secondary team-edit-btn"
                                                    onClick={() => openEditMember(supervisor)}
                                                >
                                                    Edit
                                                </button>
                                            ) : null}
                                            {canCreateSupervisor && !isLockedTeamMember(supervisor) ? (
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-primary team-edit-btn"
                                                    onClick={() => openCreateSales(supervisor)}
                                                >
                                                    + Sales
                                                </button>
                                            ) : null}
                                            {canManageSalesSupervisor && !isLockedTeamMember(supervisor) ? (
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-danger team-edit-btn"
                                                    onClick={() => openDeleteSupervisor(supervisor)}
                                                    disabled={Number(supervisor.salesCount || 0) > 0}
                                                    title={Number(supervisor.salesCount || 0) > 0 ? 'Supervisor hanya bisa dihapus jika tidak punya sales aktif.' : 'Hapus supervisor'}
                                                >
                                                    Delete
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>

                                    <MemberStats member={supervisor} />

                                    {Array.isArray(supervisor.sales) && supervisor.sales.length > 0 ? (
                                        <div className="team-children-list">
                                            {sortMembersWithLockedLast(supervisor.sales || []).map((sales) => (
                                                <div key={sales.id} className="team-child-row">
                                                    <div className="team-member-row">
                                                        <MemberButton
                                                            member={sales}
                                                            subtitle={`${sales.phone || 'Belum ada nomor WhatsApp'} • ${sales.totalLeads || 0} leads • ${sales.appointments || 0} appointment`}
                                                            metaBadge="Sales"
                                                            onClick={() => goToMemberDetail(sales.id)}
                                                            compact
                                                        />
                                                        <div className="team-member-action-stack">
                                                            {canEditMembers && !isLockedTeamMember(sales) ? (
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-sm btn-secondary team-edit-btn"
                                                                    onClick={() => openEditMember(sales)}
                                                                >
                                                                    Edit
                                                                </button>
                                                            ) : null}
                                                            {canManageSalesSupervisor && !isLockedTeamMember(sales) ? (
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-sm btn-secondary team-edit-btn"
                                                                    onClick={() => openAssignSupervisor(sales)}
                                                                >
                                                                    {sales.supervisorId ? 'Pindah SPV' : 'Assign SPV'}
                                                                </button>
                                                            ) : null}
                                                            {canManageSalesLifecycle && !isLockedTeamMember(sales) ? (
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-sm btn-danger team-edit-btn"
                                                                    onClick={() => openDeactivateMember(sales)}
                                                                >
                                                                    Deactivate
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
                                        {sortMembersWithLockedLast(group.unassignedSales || []).map((sales) => (
                                            <div key={sales.id} className="team-child-row">
                                                <div className="team-member-row">
                                                    <MemberButton
                                                        member={sales}
                                                        subtitle={`${sales.phone || 'Belum ada nomor WhatsApp'} • ${sales.totalLeads || 0} leads • ${sales.appointments || 0} appointment`}
                                                        metaBadge="Sales"
                                                        onClick={() => goToMemberDetail(sales.id)}
                                                        compact
                                                    />
                                                    <div className="team-member-action-stack">
                                                        {canEditMembers && !isLockedTeamMember(sales) ? (
                                                            <button
                                                                type="button"
                                                                className="btn btn-sm btn-secondary team-edit-btn"
                                                                onClick={() => openEditMember(sales)}
                                                            >
                                                            Edit
                                                        </button>
                                                    ) : null}
                                                    {canManageSalesSupervisor && !isLockedTeamMember(sales) ? (
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm btn-secondary team-edit-btn"
                                                            onClick={() => openAssignSupervisor(sales)}
                                                        >
                                                            {sales.supervisorId ? 'Pindah SPV' : 'Assign SPV'}
                                                        </button>
                                                    ) : null}
                                                    {canManageSalesLifecycle && !isLockedTeamMember(sales) ? (
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm btn-danger team-edit-btn"
                                                            onClick={() => openDeactivateMember(sales)}
                                                            >
                                                                Deactivate
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </article>
                            ) : null}

                            {Array.isArray(group.inactiveSales) && group.inactiveSales.length > 0 ? (
                                <article className="team-hierarchy-card team-inactive-shell">
                                    <div className="team-unassigned-head">
                                        <div>
                                            <span className="team-group-kicker">Perlu aktivasi manual</span>
                                            <h3 className="team-group-title">Sales Inactive</h3>
                                        </div>
                                        <span className="badge badge-danger">{group.inactiveSales.length} Inactive</span>
                                    </div>

                                    <div className="team-children-list">
                                        {group.inactiveSales.map((sales) => (
                                            <div key={sales.id} className="team-child-row">
                                                <div className="team-member-row">
                                                    <MemberButton
                                                        member={sales}
                                                        subtitle={`${sales.phone || 'Belum ada nomor WhatsApp'} • ${sales.totalLeads || 0} leads`}
                                                        metaBadge="Inactive"
                                                        compact
                                                        interactive={false}
                                                    />
                                                    <div className="team-member-action-stack">
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm btn-primary team-edit-btn"
                                                            onClick={() => void handleReactivateSales(sales)}
                                                            disabled={(supervisorOptionsByClient.get(sales.clientId || 'no-client') || []).length === 0}
                                                            title={(supervisorOptionsByClient.get(sales.clientId || 'no-client') || []).length === 0 ? 'Butuh supervisor aktif untuk mengaktifkan sales kembali' : 'Aktifkan kembali sales'}
                                                        >
                                                            Reactivate
                                                        </button>
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
                                    {user?.role === 'client_admin' ? (
                                        <div className="input-group">
                                            <label>Supervisor</label>
                                            <select
                                                className="input-field"
                                                value={form.supervisorId}
                                                onChange={(event) => setForm({ ...form, supervisorId: event.target.value })}
                                                required
                                            >
                                                <option value="">Pilih supervisor</option>
                                                {availableSupervisors.map((supervisor) => (
                                                    <option key={supervisor.id} value={supervisor.id}>
                                                        {supervisor.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    ) : null}
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

            {assignmentState ? (
                <div className="modal-overlay" onClick={(event) => { if (event.target === event.currentTarget) closeAssignmentModal(); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>{assignmentState.mode === 'reactivate' ? 'Reactivate Sales' : 'Assign Sales ke Supervisor'}</h2>
                        <div className="team-lifecycle-copy">
                            <p>
                                <strong>{assignmentState.sales?.name}</strong>
                                {assignmentState.mode === 'reactivate'
                                    ? ' akan diaktifkan kembali dan langsung ditempatkan ke supervisor baru.'
                                    : ' akan dipindahkan ke supervisor yang kamu pilih.'}
                            </p>
                            <p className="team-modal-helper">
                                Workspace: {groups.find((group) => group.clientId === assignmentState.clientId)?.clientName || assignmentState.sales?.clientName || '-'}
                            </p>
                        </div>
                        <div className="input-group">
                            <label>Supervisor Tujuan</label>
                            <select
                                className="input-field"
                                value={assignmentState.supervisorId || ''}
                                onChange={(event) => setAssignmentState((prev) => (
                                    prev
                                        ? { ...prev, supervisorId: event.target.value, error: '' }
                                        : prev
                                ))}
                            >
                                <option value="">Pilih supervisor</option>
                                {(supervisorOptionsByClient.get(assignmentState.clientId || 'no-client') || []).map((supervisor) => (
                                    <option key={supervisor.id} value={supervisor.id}>
                                        {supervisor.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {assignmentState.error ? <div className="login-error">{assignmentState.error}</div> : null}
                        <div className="team-lifecycle-actions">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={closeAssignmentModal}
                                disabled={assignmentState.submitting}
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => void handleSubmitAssignment()}
                                disabled={assignmentState.submitting}
                            >
                                {assignmentState.submitting
                                    ? 'Menyimpan...'
                                    : assignmentState.mode === 'reactivate'
                                        ? 'Reactivate Sales'
                                        : 'Simpan Supervisor'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {deleteSupervisorState ? (
                <div className="modal-overlay" onClick={(event) => { if (event.target === event.currentTarget) closeDeleteSupervisor(); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>Hapus Supervisor</h2>
                        <div className="team-lifecycle-copy">
                            <p>
                                Supervisor <strong>{deleteSupervisorState.supervisor?.name}</strong> akan dinonaktifkan dan tidak bisa login lagi.
                            </p>
                            <p className="team-modal-helper">
                                Aksi ini hanya diizinkan jika tidak ada sales aktif di bawah supervisor tersebut.
                            </p>
                        </div>
                        <div className="input-group">
                            <label>Password Admin</label>
                            <input
                                type="password"
                                className="input-field"
                                value={deleteSupervisorState.passwordConfirmation || ''}
                                onChange={(event) => setDeleteSupervisorState((prev) => (
                                    prev
                                        ? { ...prev, passwordConfirmation: event.target.value, error: '' }
                                        : prev
                                ))}
                                placeholder="Masukkan password admin untuk konfirmasi"
                            />
                        </div>
                        {deleteSupervisorState.error ? <div className="login-error">{deleteSupervisorState.error}</div> : null}
                        <div className="team-lifecycle-actions">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={closeDeleteSupervisor}
                                disabled={deleteSupervisorState.submitting}
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={() => void handleDeleteSupervisor()}
                                disabled={deleteSupervisorState.submitting}
                            >
                                {deleteSupervisorState.submitting ? 'Menghapus...' : 'Ya, Hapus Supervisor'}
                            </button>
                        </div>
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
                            {editingMember.role === 'sales' || editingMember.role === 'supervisor' ? (
                                <>
                                    <div className="input-group">
                                        <label>Email Login</label>
                                        <input
                                            type="email"
                                            className="input-field"
                                            value={editForm.email}
                                            onChange={(event) => setEditForm((prev) => ({ ...prev, email: event.target.value }))}
                                            required
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>Password Baru (opsional)</label>
                                        <input
                                            className="input-field"
                                            placeholder="Kosongkan jika tidak diganti"
                                            value={editForm.password}
                                            onChange={(event) => setEditForm((prev) => ({ ...prev, password: event.target.value }))}
                                        />
                                    </div>
                                </>
                            ) : null}
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

            {lifecycleState ? (
                <div className="modal-overlay" onClick={(event) => { if (event.target === event.currentTarget) closeLifecycleModal(); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>{lifecycleState.step === 'export' ? 'Export Leads Sebelum Deactivate' : 'Konfirmasi Deactivate Sales'}</h2>
                        <div className="team-lifecycle-copy">
                            {lifecycleState.step === 'export' ? (
                                <>
                                    <p>
                                        Sebelum menonaktifkan <strong>{lifecycleState.member?.name}</strong>, export semua leads yang
                                        masih berelasi dengan sales ini terlebih dahulu.
                                    </p>
                                    <p>
                                        File XLSX hasil export ini bisa dipakai lagi di menu import leads untuk reassign ke sales lain
                                        tanpa membuat lead duplikat.
                                    </p>
                                    <div className="input-group" style={{ marginTop: 12 }}>
                                        <label>Access Code Export</label>
                                        <input
                                            type="password"
                                            className="input-field"
                                            value={lifecycleState.accessCode || ''}
                                            onChange={(event) => setLifecycleState((prev) => (
                                                prev
                                                    ? { ...prev, accessCode: event.target.value, error: '' }
                                                    : prev
                                            ))}
                                            placeholder="Masukkan access code export"
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <p>
                                        Export selesai untuk <strong>{lifecycleState.member?.name}</strong>
                                        {typeof lifecycleState.exportedCount === 'number' ? ` (${lifecycleState.exportedCount} leads)` : ''}.
                                    </p>
                                    <p>
                                        Setelah dinonaktifkan, sales ini tidak bisa login dan tidak akan ikut distribusi lead sampai
                                        diaktifkan kembali oleh admin.
                                    </p>
                                    <div className="input-group" style={{ marginTop: 12 }}>
                                        <label>Password Admin</label>
                                        <input
                                            type="password"
                                            className="input-field"
                                            value={lifecycleState.passwordConfirmation || ''}
                                            onChange={(event) => setLifecycleState((prev) => (
                                                prev
                                                    ? { ...prev, passwordConfirmation: event.target.value, error: '' }
                                                    : prev
                                            ))}
                                            placeholder="Masukkan password admin untuk konfirmasi"
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        {lifecycleState.error ? <div className="login-error">{lifecycleState.error}</div> : null}

                        <div className="team-lifecycle-actions">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={closeLifecycleModal}
                                disabled={lifecycleState.exporting || lifecycleState.submitting}
                            >
                                Batal
                            </button>
                            {lifecycleState.step === 'export' ? (
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => void handleExportSalesLeads()}
                                    disabled={lifecycleState.exporting}
                                >
                                    {lifecycleState.exporting ? 'Exporting...' : 'Export Leads XLSX'}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="btn btn-danger"
                                    onClick={() => void handleConfirmDeactivate()}
                                    disabled={lifecycleState.submitting}
                                >
                                    {lifecycleState.submitting ? 'Menyimpan...' : 'Ya, Deactivate Sales'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
