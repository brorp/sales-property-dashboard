'use client';

import { useRouter } from 'next/navigation';
import Header from '../components/Header';
import { useNotifications } from '../hooks/useNotifications';
import './NotificationsPage.css';

function formatDateTime(dateValue, timeValue) {
    if (!dateValue) return '-';
    const safeTime = String(timeValue || '00:00').slice(0, 5);
    const parsed = new Date(`${dateValue}T${safeTime}:00`);
    if (Number.isNaN(parsed.getTime())) return `${dateValue} ${safeTime}`;
    return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    }).format(parsed);
}

export default function NotificationsPage() {
    const router = useRouter();
    const { notifications, loading, reload } = useNotifications();

    return (
        <div className="page-container notif-page">
            <Header
                title="Pengingat"
                showBack
                rightAction={(
                    <button
                        className="app-header-back"
                        onClick={() => void reload()}
                        disabled={loading}
                        title="Refresh"
                        style={loading ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                            style={loading ? { animation: 'notifSpin 0.7s linear infinite' } : undefined}>
                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                            <path d="M3 3v5h5" />
                        </svg>
                    </button>
                )}
            />

            {/* ── Mobile top bar ── */}
            <div className="notif-mobile-top">
                <button className="notif-mobile-back" onClick={() => router.back()} aria-label="Kembali">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                </button>
                <span className="notif-mobile-title">Pengingat</span>
                <button
                    className="notif-mobile-back"
                    onClick={() => void reload()}
                    disabled={loading}
                    title="Refresh"
                    style={loading ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        style={loading ? { animation: 'notifSpin 0.7s linear infinite' } : undefined}>
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                        <path d="M3 3v5h5" />
                    </svg>
                </button>
            </div>

            {loading ? (
                <div className="notif-empty">
                    <div className="notif-empty-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="spv-empty-spin">
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                    </div>
                    <span className="notif-empty-title">Memuat...</span>
                </div>
            ) : notifications.length === 0 ? (
                <div className="notif-empty">
                    <div className="notif-empty-icon">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                    </div>
                    <span className="notif-empty-title">Tidak ada pengingat</span>
                    <span className="notif-empty-desc">Belum ada janji temu dengan status Mau Survey saat ini.</span>
                </div>
            ) : (
                <>
                    <p className="notif-count-bar">{notifications.length} pengingat janji temu</p>
                    <div className="notif-list">
                        {notifications.map((item) => (
                            <div
                                key={item.id}
                                className="notif-card"
                                onClick={() => router.push(`/leads/${item.leadId}`)}
                            >
                                <div className="notif-card-top">
                                    <span className="notif-card-name">{item.leadName}</span>
                                    <span className="notif-card-badge">Mau Survey</span>
                                </div>
                                <div className="notif-card-meta">
                                    <div className="notif-card-meta-row">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                                        </svg>
                                        <span>{formatDateTime(item.date, item.time)}</span>
                                    </div>
                                    {item.leadPhone ? (
                                        <div className="notif-card-meta-row">
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.64 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.55 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.54a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                                            </svg>
                                            <span>{item.leadPhone}</span>
                                        </div>
                                    ) : null}
                                    {item.location ? (
                                        <div className="notif-card-meta-row">
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                                            </svg>
                                            <span>{item.location}</span>
                                        </div>
                                    ) : null}
                                    {item.salesName ? (
                                        <div className="notif-card-meta-row">
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                                            </svg>
                                            <span>{item.salesName}</span>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
