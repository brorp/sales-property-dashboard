'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import Header from '../components/Header';
import Modal from '../components/Modal';
import Select from '../components/Select';
import UserAvatar from '../components/UserAvatar';
import { apiRequest } from '../lib/api';
import { downloadLeadTransferWorkbook } from '../lib/lead-transfer-workbook';
import { usePagePolling } from '../hooks/usePagePolling';
import { useTenant } from '../context/TenantContext';
import './SettingsPage.css';
import './TeamPage.css';

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

function formatPenaltyDate(value) {
    if (!value) {
        return '-';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return '-';
    }

    return parsed.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

function formatSpLevel(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized || normalized === 'none') {
        return '-';
    }
    return normalized.toUpperCase();
}

function getPenaltyCount(member) {
    return Number(member?.penaltyCount || member?.penaltySequence || 0);
}

function hasPenaltySignal(member) {
    return Boolean(
        getPenaltyCount(member) > 0 ||
        formatSpLevel(member?.spLevel) !== '-' ||
        member?.isSuspended
    );
}

function formatPenaltyStatus(status) {
    switch (String(status || '').toLowerCase()) {
        case 'active':
            return 'Aktif';
        case 'expired':
            return 'Expired';
        case 'compensated':
            return 'Kompensasi';
        case 'invalid':
            return 'Invalid';
        default:
            return status || '-';
    }
}

function getPenaltyStatusClass(status) {
    switch (String(status || '').toLowerCase()) {
        case 'active':
            return 'badge-danger';
        case 'compensated':
            return 'badge-purple';
        case 'invalid':
            return 'badge-neutral';
        default:
            return 'badge-neutral';
    }
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
        case 'PENALTY_COMPENSATION_REASON_REQUIRED':
            return 'Alasan kompensasi wajib diisi.';
        default:
            return error.message;
    }
}

function TeamPenaltyMeta({ member }) {
    if (!hasPenaltySignal(member)) {
        return null;
    }

    return (
        <div className="team-penalty-meta">
            <span className="team-penalty-pill">Penalty #{getPenaltyCount(member)}</span>
            <span className="team-penalty-pill">SP {formatSpLevel(member?.spLevel)}</span>
        </div>
    );
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
                <span className="team-member-stat-label">Janji Temu</span>
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
                <UserAvatar name={member?.name} size={compact ? 'sm' : 'md'} />
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
    const canViewTeam = Boolean(isAdmin);
    const canViewTeamGroups = Boolean(user && ['root_admin', 'client_admin', 'supervisor'].includes(user.role));
    const canManageTeamGroups = Boolean(user && ['root_admin', 'client_admin'].includes(user.role));
    const canManagePenaltyActions = Boolean(user && ['root_admin', 'client_admin'].includes(user.role));
    const [refreshing, setRefreshing] = useState(false);
    const [fabOpen, setFabOpen] = useState(false);
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
    const [teamGroups, setTeamGroups] = useState([]);
    const [teamGroupsLoading, setTeamGroupsLoading] = useState(false);
    const [teamGroupsError, setTeamGroupsError] = useState('');
    const [newGroupName, setNewGroupName] = useState('');
    const [groupMemberDraft, setGroupMemberDraft] = useState({});
    const [groupActionLoading, setGroupActionLoading] = useState('');
    const [penaltyState, setPenaltyState] = useState(null);

    useEffect(() => {
        if (!canViewTeam) {
            return;
        }

        void refreshTeamStats();
    }, [canViewTeam, refreshTeamStats]);

    const loadTeamGroups = useCallback(async () => {
        if (!user || !canViewTeamGroups) {
            setTeamGroups([]);
            return;
        }

        setTeamGroupsLoading(true);
        setTeamGroupsError('');
        try {
            const rows = await apiRequest('/api/team/groups', { user });
            setTeamGroups(Array.isArray(rows) ? rows : []);
        } catch (err) {
            setTeamGroupsError(err instanceof Error ? err.message : 'Gagal memuat group tim');
            setTeamGroups([]);
        } finally {
            setTeamGroupsLoading(false);
        }
    }, [canViewTeamGroups, user]);

    useEffect(() => {
        if (!canViewTeamGroups) {
            setTeamGroups([]);
            return;
        }

        void loadTeamGroups();
    }, [canViewTeamGroups, loadTeamGroups]);

    usePagePolling({
        enabled: Boolean(canViewTeam && user),
        intervalMs: 3000,
        run: useCallback(async () => {
            await refreshTeamStats();
            if (canViewTeamGroups) {
                await loadTeamGroups();
            }
        }, [canViewTeamGroups, loadTeamGroups, refreshTeamStats]),
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
    const teamGroupMemberOptions = useMemo(() => {
        const optionMap = new Map();

        const pushOption = (member, roleLabel) => {
            if (!member?.id || (member?.isActive === false)) {
                return;
            }

            optionMap.set(member.id, {
                value: member.id,
                label: `${member.name} - ${roleLabel}`,
                role: member.role,
            });
        };

        for (const group of groups) {
            for (const supervisor of group.supervisors || []) {
                pushOption(supervisor, 'Supervisor');
                for (const sales of supervisor.sales || []) {
                    pushOption(sales, 'Sales');
                }
            }
            for (const sales of group.unassignedSales || []) {
                pushOption(sales, 'Sales');
            }
        }

        return Array.from(optionMap.values())
            .sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
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
            label: 'Janji Temu',
            value: summary.appointments || 0,
            tone: 'default',
            helper: `${summary.accepted || 0} diterima`,
        },
        ...(summary.suspendedSales ? [{
            key: 'suspended',
            label: 'Ditangguhkan',
            value: summary.suspendedSales || 0,
            tone: 'hot',
            helper: 'Antrian distribusi sedang diblok',
        }] : []),
    ];

    if (!canViewTeam) {
        return null;
    }

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await refreshTeamStats();
            await loadTeamGroups();
        } finally {
            setRefreshing(false);
        }
    };

    const handleCreateTeamGroup = async (event) => {
        event.preventDefault();
        if (!user || !canManageTeamGroups) {
            return;
        }

        const name = newGroupName.trim();
        if (!name) {
            setTeamGroupsError('Nama group wajib diisi.');
            return;
        }

        setGroupActionLoading('create');
        setTeamGroupsError('');
        try {
            await apiRequest('/api/team/groups', {
                method: 'POST',
                user,
                body: { name },
            });
            setNewGroupName('');
            await loadTeamGroups();
            setSubmitSuccess('Group tim berhasil dibuat.');
        } catch (err) {
            setTeamGroupsError(getTeamActionErrorMessage(err, 'Gagal membuat group tim'));
        } finally {
            setGroupActionLoading('');
        }
    };

    const handleDeleteTeamGroup = async (groupId) => {
        if (!user || !canManageTeamGroups || !groupId) {
            return;
        }

        setGroupActionLoading(`delete:${groupId}`);
        setTeamGroupsError('');
        try {
            await apiRequest(`/api/team/groups/${groupId}`, {
                method: 'DELETE',
                user,
            });
            await loadTeamGroups();
            setSubmitSuccess('Group tim berhasil dihapus.');
        } catch (err) {
            setTeamGroupsError(getTeamActionErrorMessage(err, 'Gagal menghapus group tim'));
        } finally {
            setGroupActionLoading('');
        }
    };

    const handleAddTeamGroupMember = async (groupId) => {
        if (!user || !canManageTeamGroups || !groupId) {
            return;
        }

        const userId = groupMemberDraft[groupId];
        if (!userId) {
            setTeamGroupsError('Pilih member yang ingin dimasukkan ke group.');
            return;
        }

        setGroupActionLoading(`add:${groupId}`);
        setTeamGroupsError('');
        try {
            await apiRequest(`/api/team/groups/${groupId}/members`, {
                method: 'POST',
                user,
                body: { userId },
            });
            setGroupMemberDraft((prev) => ({ ...prev, [groupId]: '' }));
            await loadTeamGroups();
        } catch (err) {
            setTeamGroupsError(getTeamActionErrorMessage(err, 'Gagal menambahkan member group'));
        } finally {
            setGroupActionLoading('');
        }
    };

    const handleRemoveTeamGroupMember = async (groupId, memberId) => {
        if (!user || !canManageTeamGroups || !groupId || !memberId) {
            return;
        }

        setGroupActionLoading(`remove:${memberId}`);
        setTeamGroupsError('');
        try {
            await apiRequest(`/api/team/groups/${groupId}/members/${memberId}`, {
                method: 'DELETE',
                user,
            });
            await loadTeamGroups();
        } catch (err) {
            setTeamGroupsError(getTeamActionErrorMessage(err, 'Gagal menghapus member group'));
        } finally {
            setGroupActionLoading('');
        }
    };

    const loadPenaltyHistory = async (salesId) => {
        if (!user || !salesId) {
            return [];
        }

        const rows = await apiRequest(`/api/penalties?salesId=${encodeURIComponent(salesId)}`, { user });
        return Array.isArray(rows) ? rows : [];
    };

    const openPenaltyActions = async (sales) => {
        if (!sales?.id) {
            return;
        }

        setPenaltyState({
            sales,
            history: [],
            loading: true,
            error: '',
            reason: '',
            submitting: '',
            success: '',
        });

        try {
            const history = await loadPenaltyHistory(sales.id);
            setPenaltyState((prev) => prev ? {
                ...prev,
                history,
                loading: false,
            } : prev);
        } catch (err) {
            setPenaltyState((prev) => prev ? {
                ...prev,
                loading: false,
                error: getTeamActionErrorMessage(err, 'Gagal memuat history penalty'),
            } : prev);
        }
    };

    const reloadPenaltyState = async (patch = {}) => {
        if (!penaltyState?.sales?.id) {
            return;
        }

        const history = await loadPenaltyHistory(penaltyState.sales.id);
        setPenaltyState((prev) => prev ? {
            ...prev,
            ...patch,
            history,
            loading: false,
            submitting: '',
        } : prev);
        await refreshTeamStats();
    };

    const handleResetPenalty = async () => {
        if (!user || !penaltyState?.sales?.id || !canManagePenaltyActions) {
            return;
        }

        setPenaltyState((prev) => prev ? { ...prev, submitting: 'reset-penalty', error: '', success: '' } : prev);
        try {
            const updated = await apiRequest(`/api/team/sales/${penaltyState.sales.id}/reset-penalties`, {
                method: 'POST',
                user,
            });
            await reloadPenaltyState({
                sales: {
                    ...penaltyState.sales,
                    penaltyCount: 0,
                    penaltySequence: 0,
                    spLevel: 'none',
                    isSuspended: false,
                    suspension: null,
                },
                success: `${updated?.updatedCount || 0} penalty ditandai invalid.`,
            });
        } catch (err) {
            setPenaltyState((prev) => prev ? {
                ...prev,
                submitting: '',
                error: getTeamActionErrorMessage(err, 'Gagal reset penalty'),
            } : prev);
        }
    };

    const handleResetSp = async () => {
        if (!user || !penaltyState?.sales?.id || !canManagePenaltyActions) {
            return;
        }

        setPenaltyState((prev) => prev ? { ...prev, submitting: 'reset-sp', error: '', success: '' } : prev);
        try {
            const updated = await apiRequest(`/api/team/sales/${penaltyState.sales.id}/reset-sp`, {
                method: 'POST',
                user,
            });
            await reloadPenaltyState({
                sales: {
                    ...penaltyState.sales,
                    spLevel: 'none',
                },
                success: `${updated?.updatedCount || 0} SP penalty direset.`,
            });
        } catch (err) {
            setPenaltyState((prev) => prev ? {
                ...prev,
                submitting: '',
                error: getTeamActionErrorMessage(err, 'Gagal reset SP'),
            } : prev);
        }
    };

    const handleCompensateSuspension = async () => {
        if (!user || !penaltyState?.sales?.suspension?.penaltyId || !canManagePenaltyActions) {
            return;
        }

        const reason = String(penaltyState.reason || '').trim();
        if (!reason) {
            setPenaltyState((prev) => prev ? {
                ...prev,
                error: 'Alasan kompensasi wajib diisi.',
            } : prev);
            return;
        }

        setPenaltyState((prev) => prev ? { ...prev, submitting: 'compensate', error: '', success: '' } : prev);
        try {
            await apiRequest(`/api/penalties/${penaltyState.sales.suspension.penaltyId}/compensate`, {
                method: 'POST',
                user,
                body: { reason },
            });
            await reloadPenaltyState({
                sales: {
                    ...penaltyState.sales,
                    penaltyCount: Math.max(0, getPenaltyCount(penaltyState.sales) - 1),
                    isSuspended: false,
                    suspension: null,
                },
                reason: '',
                success: 'Penalty aktif berhasil dikompensasi.',
            });
        } catch (err) {
            setPenaltyState((prev) => prev ? {
                ...prev,
                submitting: '',
                error: getTeamActionErrorMessage(err, 'Gagal kompensasi penalty'),
            } : prev);
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
        <div className="page-container set-page team-page">
            <Header
                title={`Kelola Tim ${getRoleLabel(user?.role)}`}
                rightAction={(
                    <button className="btn btn-sm btn-secondary btn-icon-refresh" onClick={() => void handleRefresh()} disabled={refreshing} title="Refresh">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                    </button>
                )}
            />

            {user?.role === 'root_admin' ? (
                <div className="settings-help">
                    Root Admin melihat struktur seluruh client. Pembuatan sales tetap dilakukan dari level client admin atau supervisor.
                </div>
            ) : null}

            {submitSuccess ? <p className="settings-success">{submitSuccess}</p> : null}
            {submitError ? <p className="settings-error">{submitError}</p> : null}

            {canViewTeamGroups ? (
                <section className="set-card team-custom-groups">
                    <div className="team-group-header">
                        <div>
                            <span className="team-group-kicker">Grouping Analytics</span>
                            <h2 className="team-group-title">Group Tim</h2>
                            <p className="team-group-description">Kelompokkan supervisor dan sales untuk kebutuhan analitik seperti PIC Agent vs group lain.</p>
                        </div>
                        <span className="badge badge-purple">{teamGroups.length} Group</span>
                    </div>

                    {canManageTeamGroups ? (
                        <form className="team-group-create" onSubmit={handleCreateTeamGroup}>
                            <input
                                className="input-field"
                                value={newGroupName}
                                onChange={(event) => setNewGroupName(event.target.value)}
                                placeholder="Contoh: PIC Agent, Group Supervisor 1"
                            />
                            <button type="submit" className="btn btn-primary" disabled={groupActionLoading === 'create'}>
                                {groupActionLoading === 'create' ? 'Menyimpan...' : 'Buat Group'}
                            </button>
                        </form>
                    ) : null}

                    {teamGroupsError ? <p className="settings-error">{teamGroupsError}</p> : null}

                    {teamGroupsLoading ? (
                        <div className="team-empty-subtree">Memuat group tim...</div>
                    ) : teamGroups.length === 0 ? (
                        <div className="team-empty-subtree">Belum ada group custom.</div>
                    ) : (
                        <div className="team-custom-group-grid">
                            {teamGroups.map((group) => {
                                const memberIds = new Set((group.members || []).map((member) => member.userId));
                                const addOptions = teamGroupMemberOptions.filter((option) => !memberIds.has(option.value));
                                return (
                                    <article key={group.id} className="team-custom-group-card">
                                        <div className="team-custom-group-card-head">
                                            <div>
                                                <h3>{group.name}</h3>
                                                <p>{group.members?.length || 0} member</p>
                                            </div>
                                            {canManageTeamGroups ? (
                                                <button
                                                    type="button"
                                                    className="team-icon-btn team-icon-btn--danger"
                                                    onClick={() => void handleDeleteTeamGroup(group.id)}
                                                    disabled={groupActionLoading === `delete:${group.id}`}
                                                    title="Hapus group"
                                                >
                                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
                                                </button>
                                            ) : null}
                                        </div>

                                        {Array.isArray(group.members) && group.members.length > 0 ? (
                                            <div className="team-custom-members">
                                                {group.members.map((member) => (
                                                    <span key={member.id} className="team-custom-member-pill">
                                                        <span>
                                                            <strong>{member.name}</strong>
                                                            <small>{member.role === 'supervisor' ? 'Supervisor' : 'Sales'}</small>
                                                        </span>
                                                        {canManageTeamGroups ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleRemoveTeamGroupMember(group.id, member.id)}
                                                                disabled={groupActionLoading === `remove:${member.id}`}
                                                                aria-label={`Hapus ${member.name} dari group`}
                                                            >
                                                                ×
                                                            </button>
                                                        ) : null}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="team-custom-empty">Belum ada member di group ini.</p>
                                        )}

                                        {canManageTeamGroups ? (
                                            <div className="team-custom-add-row">
                                                <Select
                                                    options={addOptions}
                                                    value={groupMemberDraft[group.id] || ''}
                                                    onChange={(value) => setGroupMemberDraft((prev) => ({ ...prev, [group.id]: value }))}
                                                    placeholder={addOptions.length ? 'Tambah supervisor/sales' : 'Semua member sudah masuk'}
                                                    clearable
                                                />
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary"
                                                    onClick={() => void handleAddTeamGroupMember(group.id)}
                                                    disabled={!groupMemberDraft[group.id] || groupActionLoading === `add:${group.id}`}
                                                >
                                                    Tambah
                                                </button>
                                            </div>
                                        ) : null}
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>
            ) : null}

            <div className="team-list">
                {groups.length === 0 ? (
                    <div className="set-card">
                        <p className="team-empty-title">Belum ada struktur tim.</p>
                        <p className="team-empty-copy">Supervisor dan sales yang aktif akan tampil di halaman ini.</p>
                    </div>
                ) : null}

                {groups.map((group) => (
                    <section key={group.id} className="set-card team-group-shell">
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
                            {sortMembersWithLockedLast(group.supervisors || []).map((supervisor) => {
                                const isSuspended = Boolean(supervisor?.isSuspended && supervisor?.suspension);
                                return (
                                    <article key={supervisor.id} className="team-hierarchy-card">
                                        <div className="team-sup-header">
                                            <button type="button" className="team-sup-identity" onClick={() => goToMemberDetail(supervisor.id)}>
                                                <UserAvatar name={supervisor.name} size="md" />
                                                <div className="team-sup-info">
                                                    <div className="team-sup-name-row">
                                                        <span className="team-name">{supervisor.name}</span>
                                                        <span className="badge badge-purple">{supervisor.salesCount || 0} Sales</span>
                                                        {isSuspended ? <span className="badge badge-danger">Suspended</span> : null}
                                                    </div>
                                                    <span className="team-sup-meta">{supervisor.email}</span>
                                                </div>
                                            </button>
                                            {!isLockedTeamMember(supervisor) ? (
                                                <div className="team-icon-group">
                                                    {canEditMembers ? (
                                                        <button type="button" className="team-icon-btn" onClick={() => openEditMember(supervisor)} title="Edit profil">
                                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                                        </button>
                                                    ) : null}
                                                    {canCreateSupervisor ? (
                                                        <button type="button" className="team-icon-btn" onClick={() => openCreateSales(supervisor)} title="Tambah sales">
                                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
                                                        </button>
                                                    ) : null}
                                                    {canManageSalesSupervisor ? (
                                                        <button type="button" className="team-icon-btn team-icon-btn--danger" onClick={() => openDeleteSupervisor(supervisor)} disabled={Number(supervisor.salesCount || 0) > 0} title={Number(supervisor.salesCount || 0) > 0 ? 'Masih punya sales aktif' : 'Hapus supervisor'}>
                                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                                                        </button>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        </div>

                                        <MemberStats member={supervisor} />

                                        {Array.isArray(supervisor.sales) && supervisor.sales.length > 0 ? (
                                            <div className="team-sales-grid">
                                                {sortMembersWithLockedLast(supervisor.sales).map((sales) => {
                                                    const salesSuspended = Boolean(sales?.isSuspended && sales?.suspension);
                                                    return (
                                                        <div key={sales.id} className={`team-sales-chip${salesSuspended ? ' is-suspended' : ''}`}>
                                                            <div className="team-sales-chip-content">
                                                                <div className="team-sales-chip-top">
                                                                    <UserAvatar name={sales.name} size="xs" shape="circle" />
                                                                </div>
                                                                <button type="button" className="team-sales-chip-body" onClick={() => goToMemberDetail(sales.id)}>
                                                                    <span className="team-sales-chip-name">{sales.name}</span>
                                                                    <span className="team-sales-chip-meta">{sales.totalLeads || 0} leads</span>
                                                                    <TeamPenaltyMeta member={sales} />
                                                                    {salesSuspended ? <span className="badge badge-danger" style={{ fontSize: '0.6rem', padding: '2px 5px', marginTop: 4 }}>Suspended</span> : null}
                                                                </button>
                                                            </div>
                                                            {!isLockedTeamMember(sales) ? (
                                                                <div className="team-sales-chip-actions">
                                                                    {hasPenaltySignal(sales) ? (
                                                                        <button type="button" className="team-chip-icon-btn team-chip-icon-btn--warning" onClick={() => void openPenaltyActions(sales)} data-tip="Penalty" title="Penalty">
                                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
                                                                        </button>
                                                                    ) : null}
                                                                    {canEditMembers ? (
                                                                        <button type="button" className="team-chip-icon-btn" onClick={() => openEditMember(sales)} data-tip="Edit" title="Edit">
                                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                                                        </button>
                                                                    ) : null}
                                                                    {canManageSalesSupervisor ? (
                                                                        <button type="button" className="team-chip-icon-btn" onClick={() => openAssignSupervisor(sales)} data-tip={sales.supervisorId ? 'Pindah SPV' : 'Assign SPV'} title={sales.supervisorId ? 'Pindah SPV' : 'Assign SPV'}>
                                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
                                                                        </button>
                                                                    ) : null}
                                                                    {canManageSalesLifecycle ? (
                                                                        <button type="button" className="team-chip-icon-btn team-chip-icon-btn--danger" onClick={() => openDeactivateMember(sales)} data-tip="Nonaktifkan" title="Nonaktifkan">
                                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
                                                                        </button>
                                                                    ) : null}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="team-empty-subtree">Supervisor ini belum punya sales aktif.</div>
                                        )}
                                    </article>
                                );
                            })}

                            {Array.isArray(group.unassignedSales) && group.unassignedSales.length > 0 ? (
                                <article className="team-hierarchy-card team-unassigned-shell">
                                    <div className="team-group-header">
                                        <div>
                                            <span className="team-group-kicker">Belum punya supervisor</span>
                                            <h3 className="team-group-title">Sales tanpa supervisor</h3>
                                        </div>
                                        <span className="badge badge-neutral">{group.unassignedSales.length} Sales</span>
                                    </div>
                                    <div className="team-sales-grid">
                                        {sortMembersWithLockedLast(group.unassignedSales).map((sales) => {
                                            const salesSuspended = Boolean(sales?.isSuspended && sales?.suspension);
                                            return (
                                                <div key={sales.id} className={`team-sales-chip${salesSuspended ? ' is-suspended' : ''}`}>
                                                    <div className="team-sales-chip-content">
                                                        <div className="team-sales-chip-top">
                                                            <UserAvatar name={sales.name} size="xs" shape="circle" />
                                                        </div>
                                                        <button type="button" className="team-sales-chip-body" onClick={() => goToMemberDetail(sales.id)}>
                                                            <span className="team-sales-chip-name">{sales.name}</span>
                                                            <span className="team-sales-chip-meta">{sales.totalLeads || 0} leads</span>
                                                            <TeamPenaltyMeta member={sales} />
                                                            {salesSuspended ? <span className="badge badge-danger" style={{ fontSize: '0.6rem', padding: '2px 5px', marginTop: 4 }}>Suspended</span> : null}
                                                        </button>
                                                    </div>
                                                    {!isLockedTeamMember(sales) ? (
                                                        <div className="team-sales-chip-actions">
                                                            {hasPenaltySignal(sales) ? (
                                                                <button type="button" className="team-chip-icon-btn team-chip-icon-btn--warning" onClick={() => void openPenaltyActions(sales)} data-tip="Penalty" title="Penalty">
                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
                                                                </button>
                                                            ) : null}
                                                            {canEditMembers ? (
                                                                <button type="button" className="team-chip-icon-btn" onClick={() => openEditMember(sales)} data-tip="Edit" title="Edit">
                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                                                </button>
                                                            ) : null}
                                                            {canManageSalesSupervisor ? (
                                                                <button type="button" className="team-chip-icon-btn" onClick={() => openAssignSupervisor(sales)} data-tip="Assign SPV" title="Assign SPV">
                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
                                                                </button>
                                                            ) : null}
                                                            {canManageSalesLifecycle ? (
                                                                <button type="button" className="team-chip-icon-btn team-chip-icon-btn--danger" onClick={() => openDeactivateMember(sales)} data-tip="Nonaktifkan" title="Nonaktifkan">
                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
                                                                </button>
                                                            ) : null}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </article>
                            ) : null}

                            {Array.isArray(group.inactiveSales) && group.inactiveSales.length > 0 ? (
                                <article className="team-hierarchy-card team-inactive-shell">
                                    <div className="team-group-header">
                                        <div>
                                            <span className="team-group-kicker">Perlu aktivasi manual</span>
                                            <h3 className="team-group-title">Sales Inactive</h3>
                                        </div>
                                        <span className="badge badge-danger">{group.inactiveSales.length} Inactive</span>
                                    </div>
                                    <div className="team-sales-grid">
                                        {group.inactiveSales.map((sales) => (
                                            <div key={sales.id} className="team-sales-chip team-sales-chip--inactive">
                                                <div className="team-sales-chip-content">
                                                    <div className="team-sales-chip-top">
                                                        <UserAvatar name={sales.name} size="xs" shape="circle" />
                                                    </div>
                                                    <div className="team-sales-chip-body">
                                                        <span className="team-sales-chip-name">{sales.name}</span>
                                                        <span className="team-sales-chip-meta">{sales.totalLeads || 0} leads</span>
                                                    </div>
                                                </div>
                                                <div className="team-sales-chip-actions">
                                                    <button type="button" className="team-chip-icon-btn" onClick={() => void handleReactivateSales(sales)} disabled={(supervisorOptionsByClient.get(sales.clientId || 'no-client') || []).length === 0} data-tip="Aktifkan" title="Aktifkan kembali">
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                                                    </button>
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

            {(canCreateSupervisor || canCreateSales) ? (
                <>
                    {fabOpen ? <div className="fab-backdrop" onClick={() => setFabOpen(false)} /> : null}
                    <div className={`fab-group${fabOpen ? ' is-open' : ''}`}>
                        {canCreateSupervisor ? (
                            <div className="fab-item">
                                <span className="fab-label">Supervisor</span>
                                <button
                                    type="button"
                                    className="fab-action"
                                    onClick={() => { setFabOpen(false); openCreateSupervisor(); }}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                                    </svg>
                                </button>
                            </div>
                        ) : null}
                        {canCreateSales ? (
                            <div className="fab-item">
                                <span className="fab-label">Sales</span>
                                <button
                                    type="button"
                                    className="fab-action"
                                    onClick={() => { setFabOpen(false); openCreateSales(null); }}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                                    </svg>
                                </button>
                            </div>
                        ) : null}
                        <button
                            type="button"
                            className="fab-main"
                            onClick={() => setFabOpen((o) => !o)}
                            title="Tambah anggota tim"
                        >
                            <svg
                                width="22" height="22" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5"
                                strokeLinecap="round" strokeLinejoin="round"
                                className="fab-main-icon"
                            >
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                        </button>
                    </div>
                </>
            ) : null}

            <Modal
                isOpen={Boolean(createModal)}
                onClose={closeCreateModal}
                title={createModal?.mode === 'supervisor'
                    ? 'Tambah Supervisor Baru'
                    : `Tambah Sales${createModal?.supervisorName ? ` untuk ${createModal.supervisorName}` : ''}`}
            >
                <form onSubmit={handleCreateSales}>
                    <div className="input-group">
                        <label>Nama</label>
                        <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
                    </div>
                    <div className="input-group">
                        <label>Email</label>
                        <input type="email" className="input-field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                    </div>
                    <div className="input-group">
                        <label>No WhatsApp</label>
                        <input className="input-field" placeholder="08xxxx / +62xxxx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                    </div>
                    <div className="input-group">
                        <label>Password</label>
                        <input className="input-field" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                    </div>
                    {createModal?.mode === 'sales' ? (
                        <>
                            {user?.role === 'client_admin' ? (
                                <div className="input-group">
                                    <label>Supervisor</label>
                                    <Select
                                        options={availableSupervisors.map((s) => ({ value: s.id, label: s.name }))}
                                        value={form.supervisorId}
                                        onChange={(val) => setForm({ ...form, supervisorId: val })}
                                        placeholder="Pilih supervisor"
                                        clearable={false}
                                    />
                                </div>
                            ) : null}
                            <div className="input-group">
                                <label>Urutan Antrian (opsional)</label>
                                <input type="number" min={1} className="input-field" value={form.queueOrder} onChange={(e) => setForm({ ...form, queueOrder: e.target.value })} />
                            </div>
                            <div className="input-group">
                                <label>Label Antrian (opsional)</label>
                                <input className="input-field" value={form.queueLabel} onChange={(e) => setForm({ ...form, queueLabel: e.target.value })} />
                            </div>
                        </>
                    ) : null}
                    {submitError ? <p className="settings-error">{submitError}</p> : null}
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={closeCreateModal}>Batal</button>
                        <button type="submit" className="btn btn-primary" disabled={submitLoading}>
                            {submitLoading ? 'Menyimpan...' : createModal?.mode === 'supervisor' ? 'Tambah Supervisor' : 'Tambah Sales'}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal
                isOpen={Boolean(assignmentState)}
                onClose={closeAssignmentModal}
                title={assignmentState?.mode === 'reactivate' ? 'Reactivate Sales' : 'Assign Sales ke Supervisor'}
            >
                <p style={{ margin: 0, fontSize: '0.9375rem', color: '#374151' }}>
                    <strong style={{ color: '#1E3A5F' }}>{assignmentState?.sales?.name}</strong>
                    {assignmentState?.mode === 'reactivate'
                        ? ' akan diaktifkan kembali dan langsung ditempatkan ke supervisor baru.'
                        : ' akan dipindahkan ke supervisor yang kamu pilih.'}
                </p>
                <div className="input-group">
                    <label>Supervisor Tujuan</label>
                    <Select
                        options={(supervisorOptionsByClient.get(assignmentState?.clientId || 'no-client') || []).map((s) => ({ value: s.id, label: s.name }))}
                        value={assignmentState?.supervisorId || ''}
                        onChange={(val) => setAssignmentState((prev) => prev ? { ...prev, supervisorId: val, error: '' } : prev)}
                        placeholder="Pilih supervisor"
                        clearable={false}
                    />
                </div>
                {assignmentState?.error ? <p className="settings-error">{assignmentState.error}</p> : null}
                <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={closeAssignmentModal} disabled={assignmentState?.submitting}>
                        Batal
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => void handleSubmitAssignment()} disabled={assignmentState?.submitting}>
                        {assignmentState?.submitting ? 'Menyimpan...' : assignmentState?.mode === 'reactivate' ? 'Reactivate Sales' : 'Simpan Supervisor'}
                    </button>
                </div>
            </Modal>

            <Modal
                isOpen={Boolean(deleteSupervisorState)}
                onClose={closeDeleteSupervisor}
                title="Hapus Supervisor"
            >
                <p style={{ margin: 0, fontSize: '0.9375rem', color: '#374151' }}>
                    Supervisor <strong style={{ color: '#1E3A5F' }}>{deleteSupervisorState?.supervisor?.name}</strong> akan dinonaktifkan dan tidak bisa login lagi. Aksi ini hanya diizinkan jika tidak ada sales aktif di bawahnya.
                </p>
                <div className="input-group">
                    <label>Password Admin</label>
                    <input
                        type="password"
                        className="input-field"
                        value={deleteSupervisorState?.passwordConfirmation || ''}
                        onChange={(e) => setDeleteSupervisorState((prev) => prev ? { ...prev, passwordConfirmation: e.target.value, error: '' } : prev)}
                        placeholder="Masukkan password admin untuk konfirmasi"
                    />
                </div>
                {deleteSupervisorState?.error ? <p className="settings-error">{deleteSupervisorState.error}</p> : null}
                <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={closeDeleteSupervisor} disabled={deleteSupervisorState?.submitting}>
                        Batal
                    </button>
                    <button type="button" className="btn btn-danger" onClick={() => void handleDeleteSupervisor()} disabled={deleteSupervisorState?.submitting}>
                        {deleteSupervisorState?.submitting ? 'Menghapus...' : 'Ya, Hapus Supervisor'}
                    </button>
                </div>
            </Modal>

            <Modal
                isOpen={Boolean(penaltyState)}
                onClose={() => setPenaltyState(null)}
                title={`Penalty ${penaltyState?.sales?.name || ''}`}
            >
                <div className="team-penalty-modal">
                    <div className="team-penalty-summary">
                        <div>
                            <span>Penalty</span>
                            <strong>#{getPenaltyCount(penaltyState?.sales)}</strong>
                        </div>
                        <div>
                            <span>SP</span>
                            <strong>{formatSpLevel(penaltyState?.sales?.spLevel)}</strong>
                        </div>
                        <div>
                            <span>Status</span>
                            <strong>{penaltyState?.sales?.isSuspended ? 'Suspended' : 'Tidak aktif'}</strong>
                        </div>
                    </div>

                    {penaltyState?.sales?.isSuspended ? (
                        <div className="team-penalty-alert">
                            Distribution queue diblok sampai {formatSuspensionUntil(penaltyState.sales.suspension?.suspendedUntil)}.
                        </div>
                    ) : null}

                    {canManagePenaltyActions ? (
                        <div className="team-penalty-actions">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => void handleResetPenalty()}
                                disabled={penaltyState?.submitting || getPenaltyCount(penaltyState?.sales) <= 0}
                            >
                                {penaltyState?.submitting === 'reset-penalty' ? 'Reset...' : 'Riset Penalty'}
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => void handleResetSp()}
                                disabled={penaltyState?.submitting || formatSpLevel(penaltyState?.sales?.spLevel) === '-'}
                            >
                                {penaltyState?.submitting === 'reset-sp' ? 'Reset...' : 'Riset SP'}
                            </button>
                        </div>
                    ) : (
                        <p className="team-modal-helper">Supervisor hanya dapat melihat history penalty sales di bawahnya.</p>
                    )}

                    {canManagePenaltyActions && penaltyState?.sales?.isSuspended && penaltyState?.sales?.suspension?.penaltyId ? (
                        <div className="team-penalty-compensate">
                            <label>Alasan kompensasi suspend</label>
                            <textarea
                                className="input-field"
                                rows={3}
                                value={penaltyState?.reason || ''}
                                onChange={(event) => setPenaltyState((prev) => prev ? { ...prev, reason: event.target.value, error: '' } : prev)}
                                placeholder="Contoh: emergency, penalty dikompensasi oleh admin"
                            />
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => void handleCompensateSuspension()}
                                disabled={penaltyState?.submitting === 'compensate'}
                            >
                                {penaltyState?.submitting === 'compensate' ? 'Mengompensasi...' : 'Kompensasi Suspend'}
                            </button>
                        </div>
                    ) : null}

                    {penaltyState?.success ? <p className="settings-success">{penaltyState.success}</p> : null}
                    {penaltyState?.error ? <p className="settings-error">{penaltyState.error}</p> : null}

                    <div className="team-penalty-history">
                        <div className="team-penalty-history-head">
                            <h3>History Penalty</h3>
                            {penaltyState?.loading ? <span>Memuat...</span> : <span>{penaltyState?.history?.length || 0} data</span>}
                        </div>
                        {penaltyState?.loading ? (
                            <div className="team-empty-subtree">Memuat history penalty...</div>
                        ) : Array.isArray(penaltyState?.history) && penaltyState.history.length > 0 ? (
                            <div className="team-penalty-history-list">
                                {penaltyState.history.map((item) => (
                                    <article key={item.id} className="team-penalty-history-item">
                                        <div className="team-penalty-history-top">
                                            <strong>Penalty #{item.penaltySequence || '-'}</strong>
                                            <span className={`badge ${getPenaltyStatusClass(item.status)}`}>{formatPenaltyStatus(item.status)}</span>
                                        </div>
                                        <p>{item.taskLabel || item.reason || 'Daily Task'}</p>
                                        <div className="team-penalty-history-meta">
                                            <span>SP {formatSpLevel(item.spLevel)}</span>
                                            <span>{item.durationHours || 0} jam</span>
                                            <span>{formatPenaltyDate(item.blockedFrom)} - {formatPenaltyDate(item.blockedUntil)}</span>
                                        </div>
                                        {item.reason ? <small>{item.reason}</small> : null}
                                        {item.compensationReason ? <small>Kompensasi: {item.compensationReason}</small> : null}
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <div className="team-empty-subtree">Belum ada history penalty untuk sales ini.</div>
                        )}
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={Boolean(editingMember)}
                onClose={closeEditMember}
                title={`Edit ${editingMember?.role === 'supervisor' ? 'Supervisor' : 'Sales'}`}
            >
                <form onSubmit={handleUpdateMember}>
                    <div className="input-group">
                        <label>Nama</label>
                        <input className="input-field" value={editForm.name} onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))} required autoFocus />
                    </div>
                    <div className="input-group">
                        <label>No WhatsApp</label>
                        <input className="input-field" placeholder="08xxxx / +62xxxx" value={editForm.phone} onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))} />
                    </div>
                    {editingMember?.role === 'sales' || editingMember?.role === 'supervisor' ? (
                        <>
                            <div className="input-group">
                                <label>Email Login</label>
                                <input type="email" className="input-field" value={editForm.email} onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))} required />
                            </div>
                            <div className="input-group">
                                <label>Password Baru (opsional)</label>
                                <input className="input-field" placeholder="Kosongkan jika tidak diganti" value={editForm.password} onChange={(e) => setEditForm((prev) => ({ ...prev, password: e.target.value }))} />
                            </div>
                        </>
                    ) : null}
                    {editError ? <p className="settings-error">{editError}</p> : null}
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={closeEditMember} disabled={editLoading}>Batal</button>
                        <button type="submit" className="btn btn-primary" disabled={editLoading}>
                            {editLoading ? 'Menyimpan...' : 'Simpan Perubahan'}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal
                isOpen={Boolean(lifecycleState)}
                onClose={closeLifecycleModal}
                title={lifecycleState?.step === 'export' ? 'Export Leads Sebelum Deactivate' : 'Konfirmasi Deactivate Sales'}
            >
                {lifecycleState?.step === 'export' ? (
                    <>
                        <p style={{ margin: 0, fontSize: '0.9375rem', color: '#374151' }}>
                            Sebelum menonaktifkan <strong style={{ color: '#1E3A5F' }}>{lifecycleState.member?.name}</strong>, export semua leads terlebih dahulu. File XLSX ini bisa dipakai untuk reassign ke sales lain tanpa duplikat.
                        </p>
                        <div className="input-group">
                            <label>Kode Akses Ekspor</label>
                            <input
                                type="password"
                                className="input-field"
                                value={lifecycleState.accessCode || ''}
                                onChange={(e) => setLifecycleState((prev) => prev ? { ...prev, accessCode: e.target.value, error: '' } : prev)}
                                placeholder="Masukkan access code export"
                            />
                        </div>
                    </>
                ) : (
                    <>
                        <p style={{ margin: 0, fontSize: '0.9375rem', color: '#374151' }}>
                            Export selesai untuk <strong style={{ color: '#1E3A5F' }}>{lifecycleState?.member?.name}</strong>
                            {typeof lifecycleState?.exportedCount === 'number' ? ` (${lifecycleState.exportedCount} leads)` : ''}. Setelah dinonaktifkan, sales tidak bisa login hingga diaktifkan kembali.
                        </p>
                        <div className="input-group">
                            <label>Password Admin</label>
                            <input
                                type="password"
                                className="input-field"
                                value={lifecycleState?.passwordConfirmation || ''}
                                onChange={(e) => setLifecycleState((prev) => prev ? { ...prev, passwordConfirmation: e.target.value, error: '' } : prev)}
                                placeholder="Masukkan password admin untuk konfirmasi"
                            />
                        </div>
                    </>
                )}
                {lifecycleState?.error ? <p className="settings-error">{lifecycleState.error}</p> : null}
                <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={closeLifecycleModal} disabled={lifecycleState?.exporting || lifecycleState?.submitting}>
                        Batal
                    </button>
                    {lifecycleState?.step === 'export' ? (
                        <button type="button" className="btn btn-primary" onClick={() => void handleExportSalesLeads()} disabled={lifecycleState?.exporting}>
                            {lifecycleState?.exporting ? 'Exporting...' : 'Export Leads XLSX'}
                        </button>
                    ) : (
                        <button type="button" className="btn btn-danger" onClick={() => void handleConfirmDeactivate()} disabled={lifecycleState?.submitting}>
                            {lifecycleState?.submitting ? 'Menyimpan...' : 'Ya, Deactivate Sales'}
                        </button>
                    )}
                </div>
            </Modal>
        </div>
    );
}
