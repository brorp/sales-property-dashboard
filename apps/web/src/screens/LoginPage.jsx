'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, user } = useAuth();
    const tenant = useTenant();
    const router = useRouter();

    useEffect(() => {
        if (user) {
            if (user.role === 'sales') {
                router.replace('/daily-tasks');
            } else if (user.role === 'supervisor') {
                router.replace('/supervisor-tasks');
            } else {
                router.replace('/');
            }
        }
    }, [user, router]);

    if (user || tenant.loading) return null;

    const siteTitle = tenant.isClientSite ? tenant.siteLabel : 'Property Lounge';
    const siteSubtitle = tenant.isClientSite
        ? `${tenant.siteLabel} workspace on Property Lounge`
        : 'Login to your account';

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const result = await login(email, password);
            if (result.success) {
                if (result.user?.role === 'sales') {
                    router.replace('/daily-tasks');
                } else if (result.user?.role === 'supervisor') {
                    router.replace('/supervisor-tasks');
                } else {
                    router.replace('/');
                }
            } else {
                setError(result.error);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            {/* Left Panel — Branding */}
            <div className="login-left">
                <div className="login-left-top">
                    <div className="login-brand-badge">
                        {tenant.isClientSite ? tenant.siteLabel : 'Property Lounge'}
                    </div>
                    <img src="/logo-wr.png" alt="Property Lounge" className="login-left-logo" />
                </div>

                <div className="login-left-middle">
                    <div>
                        <h1 className="login-left-tagline">
                            Kelola leads properti<br />lebih <span>cerdas & cepat</span>
                        </h1>
                        <p className="login-left-desc">
                            Dashboard terpusat untuk tim sales, supervisor, dan admin dalam satu platform.
                        </p>
                    </div>
                </div>

                <div className="login-left-bottom">
                    <div className="login-left-stats">
                        <div className="login-stat-item">
                            <span className="login-stat-value">Auto</span>
                            <span className="login-stat-label">Distribusi Lead</span>
                        </div>
                        <div className="login-stat-item">
                            <span className="login-stat-value">Real-time</span>
                            <span className="login-stat-label">Monitoring</span>
                        </div>
                        <div className="login-stat-item">
                            <span className="login-stat-value">WA</span>
                            <span className="login-stat-label">Terintegrasi</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Panel — Form */}
            <div className="login-right">
                {/* Mobile: navy header strip */}
                <div className="login-mobile-header">
                    <img src="/logo-wr.png" alt="Property Lounge" className="login-mobile-logo" />
                    <p className="login-mobile-tagline">
                        Dashboard sales properti terpusat
                    </p>
                </div>

                <div className="login-right-inner">
                    <div className="login-mobile-form-area">
                    <div className="login-site-badge">
                        {tenant.isClientSite ? `Client Site: ${tenant.siteLabel}` : 'Sales Management Panel'}
                    </div>

                    <h2 className="login-body-title">Selamat datang</h2>
                    <p className="login-body-subtitle">Masukkan kredensial Anda untuk melanjutkan</p>

                    <form onSubmit={handleSubmit} className="login-form">
                        <div className="input-group">
                            <label>Email</label>
                            <div className="input-icon-wrapper">
                                <span className="input-icon">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="2" y="4" width="20" height="16" rx="2"/>
                                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                                    </svg>
                                </span>
                                <input
                                    type="email"
                                    className="input-field"
                                    placeholder="nama@email.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="input-group">
                            <label>Password</label>
                            <div className="input-icon-wrapper">
                                <span className="input-icon">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="11" width="18" height="11" rx="2"/>
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                    </svg>
                                </span>
                                <input
                                    type={showPass ? 'text' : 'password'}
                                    className="input-field"
                                    placeholder="Masukkan password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                                <button type="button" className="input-action" onClick={() => setShowPass(!showPass)}>
                                    {showPass ? (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                                            <line x1="1" y1="1" x2="23" y2="23"/>
                                        </svg>
                                    ) : (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                            <circle cx="12" cy="12" r="3"/>
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        {error && <div className="login-error">{error}</div>}

                        <button type="submit" className="login-submit" disabled={loading}>
                            {loading ? 'Memproses...' : 'Masuk'}
                        </button>
                    </form>

                    <div className="login-footer">
                        &copy; {new Date().getFullYear()} Property Lounge. All rights reserved.
                    </div>
                    </div>{/* login-mobile-form-area */}
                </div>{/* login-right-inner */}
            </div>{/* login-right */}
        </div>
    );
}
