import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './LoginPage.css';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, user } = useAuth();
    const navigate = useNavigate();

    if (user) { navigate('/', { replace: true }); return null; }

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        setTimeout(() => {
            const result = login(email, password);
            if (result.success) { navigate('/', { replace: true }); }
            else { setError(result.error); }
            setLoading(false);
        }, 500);
    };

    return (
        <div className="login-container">
            <div className="login-glow1" />
            <div className="login-glow2" />
            <div className="login-card">
                <div className="login-logo">
                    <div className="login-logo-icon">🏢</div>
                    <h1>Property Lounge</h1>
                    <p>Sales Dashboard</p>
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
                <div className="demo-accounts">
                    <p className="demo-title">Demo Accounts:</p>
                    <div className="demo-list">
                        <button onClick={() => { setEmail('admin@propertylounge.id'); setPassword('admin123'); }}>
                            <span className="demo-role">Admin</span><span>admin@propertylounge.id</span>
                        </button>
                        <button onClick={() => { setEmail('andi@propertylounge.id'); setPassword('sales123'); }}>
                            <span className="demo-role">Sales</span><span>andi@propertylounge.id</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
