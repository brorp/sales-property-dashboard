'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useTheme } from '../context/ThemeContext';
import Header from '../components/Header';
import UserAvatar from '../components/UserAvatar';
import './ProfilePage.css';

function formatClientNameFromSlug(slug) {
    if (!slug) return '';
    return String(slug).split(/[-_]/).filter(Boolean)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

const IconUser = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
);

const IconRefresh = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
);

const IconNavigation = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="3 11 22 2 13 21 11 13 3 11" />
    </svg>
);

const IconBuilding = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
);

const IconRss = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" fill="currentColor" />
    </svg>
);

const IconXCircle = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
    </svg>
);

const IconMessageSquare = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
);

const IconSend = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
);

const IconLogOut = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
);

const IconUsers = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
);

const IconAlertTriangle = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
);

const IconFileText = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" /><path d="M16 13H8M16 17H8M10 9H8" />
    </svg>
);

const IconBell = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
);

const IconBellOff = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        <path d="M18.63 13A17.9 17.9 0 0 1 18 8" />
        <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
        <path d="M18 8a6 6 0 0 0-9.33-5" />
        <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
);

const IconBellCheck = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        <polyline points="9 12 11 14 15 10" />
    </svg>
);

const IconChevron = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6" />
    </svg>
);


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

function MenuItem({ icon, label, onClick, danger = false, iconColor }) {
    return (
        <button className={`pf-menu-item${danger ? ' pf-menu-item--danger' : ''}`} onClick={onClick}>
            <span className="pf-menu-icon" style={iconColor ? { background: iconColor + '1a', color: iconColor } : {}}>
                {icon}
            </span>
            <span className="pf-menu-label">{label}</span>
            <span className="pf-menu-arrow"><IconChevron /></span>
        </button>
    );
}

function MenuGroup({ title, icon, iconColor, isOpen, onToggle, children }) {
    return (
        <div className="pf-group">
            <button type="button" className="pf-group-header" onClick={onToggle}>
                <span className="pf-menu-icon" style={iconColor ? { background: iconColor + '1a', color: iconColor } : {}}>
                    {icon}
                </span>
                <span className="pf-group-title">{title}</span>
                <span className={`pf-group-chevron${isOpen ? ' is-open' : ''}`}>
                    <IconChevron />
                </span>
            </button>
            <div className={`pf-group-body${isOpen ? ' is-open' : ''}`}>
                {children}
            </div>
        </div>
    );
}

export default function ProfilePage() {
    const { user, logout, isAdmin, getRoleLabel } = useAuth();
    const tenant = useTenant();
    const { theme, setTheme } = useTheme();
    const router = useRouter();
    const [openGroups, setOpenGroups] = useState({ akun: true, leads: true, whatsapp: true, riwayat: true });
    const toggle = (key) => setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
    const [showNotifGuide, setShowNotifGuide] = useState(false);

    const [notifPermission, setNotifPermission] = useState(() => {
        if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
        return Notification.permission;
    });

    useEffect(() => {
        if (typeof window === 'undefined' || !('Notification' in window)) return;
        setNotifPermission(Notification.permission);

        // Auto-sync saat user balik ke tab setelah ubah pengaturan browser
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                const current = Notification.permission;
                setNotifPermission(current);
                // Tutup modal panduan otomatis jika sudah diizinkan
                if (current === 'granted') setShowNotifGuide(false);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, []);

    const requestNotifPermission = async () => {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'denied') {
            setShowNotifGuide(true);
            return;
        }
        if (Notification.permission === 'granted') {
            new Notification('Notifikasi aktif ✓', {
                body: 'Kamu sudah mengaktifkan notifikasi untuk aplikasi ini.',
                icon: '/favicon.ico',
            });
            return;
        }
        const result = await Notification.requestPermission();
        setNotifPermission(result);
        if (result === 'granted') {
            new Notification('Notifikasi berhasil diaktifkan 🎉', {
                body: 'Kamu akan menerima pemberitahuan dari aplikasi ini.',
                icon: '/favicon.ico',
            });
        } else if (result === 'denied') {
            setShowNotifGuide(true);
        }
    };

    const handleLogout = () => { logout(); router.replace('/login'); };

    const canManageDistribution = user?.role === 'client_admin';
    const canReassignLeads = user?.role === 'client_admin' || user?.role === 'root_admin';
    const canManageCancelReasons = user?.role === 'client_admin' || user?.role === 'root_admin';
    const canManageSharedWhatsApp = tenant.canManageSharedWhatsApp(user);
    const canSeeLogs = user?.role === 'client_admin' || user?.role === 'root_admin';

    const workspaceLabel = tenant.isClientSite
        ? tenant.siteLabel
        : formatClientNameFromSlug(user?.clientSlug) || 'Master Workspace';

    const hasLeadsGroup = canManageDistribution || canReassignLeads || canManageCancelReasons;

    return (
        <div className="page-container pf-page">
            <Header title="Pengaturan" />

            {/* ── Profile Card ──────────────────────────────── */}
            <div className="pf-card">
                <UserAvatar name={user.name} size="lg" shape="circle" />
                <div className="pf-info">
                    <h2 className="pf-name">{user.name}</h2>
                    <p className="pf-email">{user.email}</p>
                    <p className="pf-workspace">{workspaceLabel}</p>
                </div>
                <span className={`badge ${isAdmin ? 'badge-purple' : 'badge-success'}`}>
                    {isAdmin ? getRoleLabel(user.role) : 'Sales'}
                </span>
            </div>

            {/* ── Menu List ─────────────────────────────────── */}
            <div className="pf-menu-list">

                {/* Akun */}
                <MenuGroup title="Akun" icon={<IconUser />} iconColor="#1E3A5F" isOpen={openGroups.akun} onToggle={() => toggle('akun')}>
                    <MenuItem icon={<IconUser />} label="Ubah Profil" onClick={() => router.push('/settings/profile')} iconColor="#1E3A5F" />
                    {notifPermission !== 'unsupported' ? (
                        <button type="button" className="pf-menu-item" onClick={requestNotifPermission}>
                            <span
                                className="pf-menu-icon"
                                style={{
                                    background: notifPermission === 'granted' ? '#16A34A1a' : notifPermission === 'denied' ? '#EF44441a' : '#F59E0B1a',
                                    color: notifPermission === 'granted' ? '#16A34A' : notifPermission === 'denied' ? '#EF4444' : '#F59E0B',
                                }}
                            >
                                {notifPermission === 'granted' ? <IconBellCheck /> : notifPermission === 'denied' ? <IconBellOff /> : <IconBell />}
                            </span>
                            <span className="pf-menu-label">Notifikasi</span>
                            <span className="tt-track">
                                <span
                                    className="tt-thumb"
                                    style={{
                                        left: notifPermission === 'granted' ? '28px' : '2px',
                                        background: notifPermission === 'granted' ? '#16A34A' : notifPermission === 'denied' ? '#EF4444' : 'var(--primary)',
                                        transition: 'left 200ms cubic-bezier(0.4, 0, 0.2, 1), background 200ms ease',
                                    }}
                                />
                                <span
                                    className="tt-icon"
                                    style={{
                                        left: '2px',
                                        color: notifPermission === 'granted' ? 'var(--text-muted)' : '#fff',
                                    }}
                                >
                                    {notifPermission === 'denied' ? <IconBellOff size={13} /> : <IconBell size={13} />}
                                </span>
                                <span
                                    className="tt-icon"
                                    style={{
                                        left: '28px',
                                        color: notifPermission === 'granted' ? '#fff' : 'var(--text-muted)',
                                    }}
                                >
                                    <IconBellCheck size={13} />
                                </span>
                            </span>
                        </button>
                    ) : null}
                    <button type="button" className="pf-menu-item" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                        <span className="pf-menu-icon" style={{ background: '#6366F11a', color: '#6366F1' }}>
                            {theme === 'dark' ? <IconSun /> : <IconMoon />}
                        </span>
                        <span className="pf-menu-label">{theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}</span>
                        <span className="tt-track">
                            <span className="tt-thumb" />
                            <span className="tt-icon tt-sun"><IconSun /></span>
                            <span className="tt-icon tt-moon"><IconMoon /></span>
                        </span>
                    </button>
                </MenuGroup>

                {/* Leads & Distribusi */}
                {hasLeadsGroup ? (
                    <MenuGroup title="Leads & Distribusi" icon={<IconRefresh />} iconColor="#0EA5E9" isOpen={openGroups.leads} onToggle={() => toggle('leads')}>
                        {canManageDistribution ? (
                            <MenuItem icon={<IconRefresh />} label="Urutan Distribusi" onClick={() => router.push('/settings/distribution-order')} iconColor="#0EA5E9" />
                        ) : null}
                        {canReassignLeads ? (
                            <MenuItem icon={<IconNavigation />} label="Leads Dialihkan" onClick={() => router.push('/settings/reassigned-leads')} iconColor="#7C3AED" />
                        ) : null}
                        {canManageDistribution ? (
                            <MenuItem icon={<IconBuilding />} label="Kelola Unit" onClick={() => router.push('/settings/units')} iconColor="#0D9488" />
                        ) : null}
                        {canManageCancelReasons ? (
                            <MenuItem icon={<IconRss />} label="Kelola Sumber Leads" onClick={() => router.push('/settings/lead-sources')} iconColor="#F97316" />
                        ) : null}
                        {canManageCancelReasons ? (
                            <MenuItem icon={<IconXCircle />} label="Kelola Alasan Batal" onClick={() => router.push('/settings/cancel-reasons')} iconColor="#EF4444" />
                        ) : null}
                    </MenuGroup>
                ) : null}

                {/* WhatsApp */}
                {canManageSharedWhatsApp ? (
                    <MenuGroup title="WhatsApp" icon={<IconMessageSquare />} iconColor="#16A34A" isOpen={openGroups.whatsapp} onToggle={() => toggle('whatsapp')}>
                        <MenuItem icon={<IconMessageSquare />} label="Pengaturan WhatsApp" onClick={() => router.push('/settings/whatsapp')} iconColor="#16A34A" />
                        <MenuItem icon={<IconSend />} label="WhatsApp Broadcast" onClick={() => router.push('/broadcast')} iconColor="#16A34A" />
                    </MenuGroup>
                ) : null}

                {/* Riwayat (mobile only) */}
                <div className="pf-menu-mobile-only">
                    <MenuGroup title="Riwayat" icon={<IconFileText />} iconColor="#0EA5E9" isOpen={openGroups.riwayat} onToggle={() => toggle('riwayat')}>
                        {canSeeLogs ? (
                            <MenuItem icon={<IconFileText />} label="Log Aktivitas" onClick={() => router.push('/activity-logs')} iconColor="#0EA5E9" />
                        ) : null}
                        <MenuItem icon={<IconAlertTriangle />} label="Penalti" onClick={() => router.push('/penalties')} iconColor="#F97316" />
                    </MenuGroup>
                </div>

                <MenuItem icon={<IconLogOut />} label="Keluar" onClick={handleLogout} danger />
            </div>

            <p className="pf-version">PLCRM v2.0</p>

            {/* ── Notification Blocked Guide Modal ── */}
            {showNotifGuide ? (() => {
                const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
                const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
                const isChrome = /Chrome|CriOS/i.test(ua) && !/Edg|OPR/i.test(ua);
                const isFirefox = /Firefox|FxiOS/i.test(ua);
                const isSafari = /Safari/i.test(ua) && !isChrome && !isFirefox;
                const isSamsung = /SamsungBrowser/i.test(ua);
                const isEdge = /Edg\//i.test(ua);

                let browserName = 'Browser';
                let steps = [];

                if (isSamsung) {
                    browserName = 'Samsung Browser';
                    steps = isMobile ? [
                        'Buka Samsung Browser, tap ikon ⋮ (tiga titik) di pojok kanan bawah',
                        'Pilih Pengaturan → Situs → Notifikasi',
                        'Cari alamat situs ini, tap lalu pilih Izinkan',
                        'Kembali ke aplikasi dan coba lagi',
                    ] : [
                        'Klik ikon gembok 🔒 di address bar',
                        'Klik Izin situs',
                        'Ubah Notifikasi dari Blokir ke Izinkan',
                        'Refresh halaman dan coba lagi',
                    ];
                } else if (isFirefox) {
                    browserName = 'Firefox';
                    steps = isMobile ? [
                        'Tap ikon ⋮ (tiga titik) di kanan address bar',
                        'Pilih Pengaturan → Privasi & Keamanan',
                        'Scroll ke Izin → Notifikasi',
                        'Cari dan hapus situs ini dari daftar Blokir, lalu coba lagi',
                    ] : [
                        'Klik ikon gembok 🔒 di address bar',
                        'Klik panah → lalu klik Informasi lebih lanjut',
                        'Buka tab Izin',
                        'Di baris Tampilkan Notifikasi, ubah ke Izinkan',
                        'Refresh halaman dan coba lagi',
                    ];
                } else if (isSafari) {
                    browserName = 'Safari';
                    steps = isMobile ? [
                        'Buka Pengaturan di iPhone/iPad',
                        'Scroll dan tap Safari → Notifikasi',
                        'Cari nama situs ini dan ubah ke Izinkan',
                        'Kembali ke Safari dan coba lagi',
                    ] : [
                        'Di menu bar, klik Safari → Pengaturan (atau Preferensi)',
                        'Pilih tab Situs Web → Notifikasi',
                        'Cari situs ini di daftar, ubah ke Izinkan',
                        'Refresh halaman dan coba lagi',
                    ];
                } else if (isEdge) {
                    browserName = 'Microsoft Edge';
                    steps = [
                        'Klik ikon gembok 🔒 di address bar',
                        'Klik Izin untuk situs ini',
                        'Ubah Notifikasi dari Blokir ke Izinkan',
                        'Refresh halaman dan coba lagi',
                    ];
                } else {
                    // Chrome (desktop & Android)
                    browserName = isChrome ? 'Chrome' : 'Browser';
                    steps = isMobile ? [
                        'Tap ikon ⋮ (tiga titik) di kanan atas Chrome',
                        'Pilih Pengaturan → Pengaturan situs → Notifikasi',
                        'Cari alamat situs ini, tap lalu pilih Izinkan',
                        'Kembali ke aplikasi dan coba lagi',
                    ] : [
                        'Klik ikon gembok 🔒 (atau ⓘ) di address bar',
                        'Klik Izin situs',
                        'Cari baris Notifikasi, ubah dari Blokir ke Izinkan',
                        'Refresh halaman dan coba lagi',
                    ];
                }

                return (
                    <div
                        className="sheet-overlay"
                        onClick={(e) => { if (e.target === e.currentTarget) setShowNotifGuide(false); }}
                    >
                        <div className="bottom-sheet">
                            <div className="sheet-handle" />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                                <span style={{
                                    width: 36, height: 36, borderRadius: 10,
                                    background: '#EF44441a', color: '#EF4444',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                }}>
                                    <IconBellOff />
                                </span>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Notifikasi Diblokir</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{browserName} · {isMobile ? 'HP' : 'Laptop / PC'}</div>
                                </div>
                            </div>

                            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '10px 0 14px', lineHeight: 1.5 }}>
                                Browser kamu sudah memblokir notifikasi dari situs ini. Ikuti langkah berikut untuk mengizinkannya kembali:
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {steps.map((step, i) => (
                                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                        <span style={{
                                            width: 22, height: 22, borderRadius: '50%',
                                            background: 'var(--primary)', color: '#fff',
                                            fontSize: '0.72rem', fontWeight: 800,
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            flexShrink: 0, marginTop: 1,
                                        }}>{i + 1}</span>
                                        <span style={{ fontSize: '0.84rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>{step}</span>
                                    </div>
                                ))}
                            </div>

                            <div style={{ marginTop: 18, padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 10, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                💡 Setelah mengubah pengaturan, <strong>refresh halaman</strong> lalu buka Pengaturan → Notifikasi lagi dan klik aktifkan.
                            </div>

                            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                                <button type="button" className="btn btn-plcrm btn-primary animate-hover" style={{ flex: 1 }} onClick={() => setShowNotifGuide(false)}>Tutup</button>
                            </div>
                        </div>
                    </div>
                );
            })() : null}
        </div>
    );
}
