'use client';

import { useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { useTheme } from '../context/ThemeContext';
import { useNavData } from '../hooks/useNavData';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import './Sidebar.css';

const IconSun = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
);

const IconMoon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
);

const ADMIN_TABS = [
    { key: '/overview', icon: 'overview', label: 'Ringkasan' },
    { key: '/', icon: 'analytics', label: 'Analitik' },
    { key: '/leads', icon: 'leads', label: 'Leads' },
    { key: '/appointments', icon: 'appointment', label: 'Janji Temu' },
    { key: '/activity-logs', icon: 'logs', label: 'Log' },
    { key: '/penalties', icon: 'warning', label: 'Penalti' },
    { key: '/team', icon: 'team', label: 'Tim' },
    { key: '/settings', icon: 'settings', label: 'Pengaturan' },
];

const SUPERVISOR_TABS = [
    { key: '/supervisor-tasks', icon: 'tasks', label: 'Tugas' },
    { key: '/leads', icon: 'leads', label: 'Leads' },
    { key: '/appointments', icon: 'appointment', label: 'Janji Temu' },
    { key: '/', icon: 'analytics', label: 'Analitik' },
    { key: '/team', icon: 'team', label: 'Tim' },
    { key: '/penalties', icon: 'warning', label: 'Penalti' },
    { key: '/settings', icon: 'settings', label: 'Pengaturan' },
];

const SALES_TABS = [
    { key: '/daily-tasks', icon: 'tasks', label: 'Tugas' },
    { key: '/leads', icon: 'leads', label: 'Leads' },
    { key: '/appointments', icon: 'appointment', label: 'Janji Temu' },
    { key: '/', icon: 'analytics', label: 'Analitik' },
    { key: '/penalties', icon: 'warning', label: 'Penalti' },
    { key: '/settings', icon: 'settings', label: 'Pengaturan' },
];

function Icon({ name }) {
    const c = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' };
    if (name === 'overview') return <svg {...c}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
    if (name === 'analytics') return <svg {...c}><path d="M3 3v18h18"/><path d="M7 16l4-5 4 4 4-6"/></svg>;
    if (name === 'leads') return <svg {...c}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    if (name === 'team') return <svg {...c}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    if (name === 'appointment') return <svg {...c}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>;
    if (name === 'logs') return <svg {...c}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/></svg>;
    if (name === 'tasks') return <svg {...c}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;
    if (name === 'warning') return <svg {...c}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
    if (name === 'settings') return <svg {...c}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
    if (name === 'logout') return <svg {...c}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
    return <svg {...c}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
}

function CollapseIcon({ collapsed }) {
    const c = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
    if (collapsed) return (
        <svg {...c}>
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
            <line x1="3" y1="7" x2="9" y2="7"/>
            <line x1="3" y1="11" x2="9" y2="11"/>
            <line x1="3" y1="15" x2="9" y2="15"/>
        </svg>
    );
    return (
        <svg {...c}>
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="15" y1="3" x2="15" y2="21"/>
            <line x1="15" y1="7" x2="21" y2="7"/>
            <line x1="15" y1="11" x2="21" y2="11"/>
            <line x1="15" y1="15" x2="21" y2="15"/>
        </svg>
    );
}

function formatClientNameFromSlug(slug) {
    if (!slug) return '';
    return String(slug).split(/[-_]/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

export default function Sidebar({ collapsed, onToggleCollapsed }) {
    const { user, logout } = useAuth();
    const tenant = useTenant();
    const { activeWorkspace, workspaces } = useWorkspace();
    const { theme, setTheme } = useTheme();
    const { hasUnreadLeads, hasUnreadLogs, taskCounts, supervisorTaskCount } = useNavData();
    const pathname = usePathname();
    const router = useRouter();

    const tabs = useMemo(() => {
        return user?.role === 'sales' ? SALES_TABS
            : user?.role === 'supervisor' ? SUPERVISOR_TABS
            : ADMIN_TABS;
    }, [user?.role]);

    if (!user || pathname === '/login') return null;

    const isActive = (key) => key === '/' ? pathname === '/' : pathname.startsWith(key);

    const clientName = activeWorkspace?.name || tenant.tenant?.name || formatClientNameFromSlug(user?.clientSlug);
    const isTenantWorkspace = user?.role !== 'root_admin' && Boolean(clientName);
    const brandTitle = isTenantWorkspace ? 'CMS Dashboard' : 'Property Lounge';
    const brandSubtitle = isTenantWorkspace ? '' : 'CRM Dashboard';

    const isWR = clientName?.toLowerCase().includes('residence');
    const isWV = clientName?.toLowerCase().includes('village');
    const logoUrl = isWR
        ? 'https://ik.imagekit.io/plcrm/property-lounge/asset/logo-wr.png'
        : isWV
            ? 'https://ik.imagekit.io/plcrm/property-lounge/asset/logo-wv.png'
            : null;

    const handleLogout = () => { logout(); router.replace('/login'); };

    return (
        <nav className={`sidebar${collapsed ? ' is-collapsed' : ''}`}>
            <div className="sidebar-brand">
                {logoUrl ? (
                    <img
                        src={logoUrl}
                        alt={clientName}
                        style={{ height: collapsed ? '50px' : '150px', width: '100%', objectFit: 'contain', objectPosition: 'center', display: 'block' }}
                    />
                ) : !collapsed ? (
                    <div className="sidebar-brand-title">{brandTitle}</div>
                ) : null}
                {brandSubtitle && !logoUrl && !collapsed ? <div className="sidebar-brand-subtitle">{brandSubtitle}</div> : null}
                {workspaces.length > 1 ? (
                    <div className="sidebar-ws-wrap">
                        <WorkspaceSwitcher variant={collapsed ? 'collapsed' : 'desktop'} />
                        <div style={{ width: '100%', height: '1px', background: '#F1F5F9', margin: '4px 0' }} />
                    </div>
                ) : null}
            </div>

            <div className="sidebar-nav">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        className={`sidebar-tab${isActive(tab.key) ? ' active' : ''}`}
                        onClick={() => router.push(tab.key)}
                    >
                        <span className="sidebar-icon-wrap">
                            <span className="sidebar-icon"><Icon name={tab.icon} /></span>
                            {tab.key === '/leads' && hasUnreadLeads && !isActive(tab.key) ? <span className="sidebar-unread-dot" /> : null}
                            {tab.key === '/activity-logs' && hasUnreadLogs && !isActive(tab.key) ? <span className="sidebar-unread-dot" /> : null}
                            {tab.key === '/daily-tasks' && taskCounts.totalCount > 0 ? (
                                <span className="sidebar-count-badge">{taskCounts.totalCount}</span>
                            ) : null}
                            {tab.key === '/supervisor-tasks' && supervisorTaskCount > 0 ? (
                                <span className="sidebar-count-badge" style={{ background: '#ef4444' }}>{supervisorTaskCount}</span>
                            ) : null}
                        </span>
                        {!collapsed ? <span className="sidebar-label">{tab.label}</span> : null}
                    </button>
                ))}
            </div>

            <div className="sidebar-footer">
                {collapsed ? (
                    <button
                        type="button"
                        className="sidebar-tab sidebar-theme-icon-btn"
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        title={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
                    >
                        <span className="sidebar-icon-wrap">
                            <span className="sidebar-icon">
                                {theme === 'dark' ? <IconSun /> : <IconMoon />}
                            </span>
                        </span>
                    </button>
                ) : (
                    <div className="sidebar-theme-row">
                        <span className="sidebar-theme-label">Tema</span>
                        <button
                            type="button"
                            className="theme-toggle"
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            title={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
                        >
                            <span className="tt-track">
                                <span className="tt-thumb" />
                                <span className="tt-icon tt-sun"><IconSun /></span>
                                <span className="tt-icon tt-moon"><IconMoon /></span>
                            </span>
                        </button>
                    </div>
                )}
                <button type="button" className="sidebar-logout" onClick={handleLogout}>
                    <span className="sidebar-icon"><Icon name="logout" /></span>
                    {!collapsed ? <span className="sidebar-label">Logout</span> : null}
                </button>
            </div>

            <button
                type="button"
                className="sidebar-toggle"
                onClick={onToggleCollapsed}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
                <CollapseIcon collapsed={collapsed} />
            </button>
        </nav>
    );
}
