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
            router.replace('/');
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
                router.replace('/');
            } else {
                setError(result.error);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-glow1" />
            <div className="login-glow2" />
            <div className="login-card">
                <div className="login-logo">
                    <div className="login-site-badge">
                        {tenant.isClientSite ? `Client Site: ${tenant.siteLabel}` : 'SALES MANAGEMENT PANEL'}
                    </div>
                    <div className="login-logo-mark">
                        <img
                            src="/logo-wr.png"
                            alt="Widari Residence"
                            className="login-logo-image"
                            style={{ width: '100%', maxHeight: '64px', objectFit: 'contain' }}
                        />
                    </div>
                    {/* <h1>{siteTitle}</h1> */}
                    {/* <p>{siteSubtitle}</p> */}
                </div>
                <form onSubmit={handleSubmit} className="login-form">
                    <div className="input-group">
                        <label>Email</label>
                        <div className="input-icon-wrapper">
                            <span className="input-icon">📧</span>
                            <input type="email" className="input-field" placeholder="Masukkan email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                        </div>
                    </div>
                    <div className="input-group">
                        <label>Password</label>
                        <div className="input-icon-wrapper">
                            <span className="input-icon">🔒</span>
                            <input type={showPass ? 'text' : 'password'} className="input-field" placeholder="Masukkan password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                            <button type="button" className="input-action" onClick={() => setShowPass(!showPass)}>{showPass ? '🙈' : '👁'}</button>
                        </div>
                    </div>
                    {error && <div className="login-error">{error}</div>}
                    <button type="submit" className="btn btn-primary btn-full login-submit" disabled={loading}>
                        {loading ? '⏳ Memproses...' : 'Submit'}
                    </button>
                </form>
            </div>
        </div>
    );
}
