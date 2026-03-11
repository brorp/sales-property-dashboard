import { createContext, useContext, useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const AuthContext = createContext(null);

// ─── Role helpers ────────────────────────────────────────────────────────────
const ROLE_HIERARCHY = { sales: 0, supervisor: 1, client_admin: 2, root_admin: 3 };

function hasMinRole(userRole, minRole) {
    return (ROLE_HIERARCHY[userRole] ?? -1) >= (ROLE_HIERARCHY[minRole] ?? 999);
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Restore session on mount
    useEffect(() => {
        const saved = localStorage.getItem('pl_user');
        if (saved) {
            try { setUser(JSON.parse(saved)); } catch { /* ignore */ }
        }
        setLoading(false);
    }, []);

    const login = async (email, password) => {
        try {
            const res = await fetch(`${API_BASE}/auth/sign-in/email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, password }),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                return { success: false, error: errorData.message || 'Email atau password salah' };
            }

            const data = await res.json();
            const userData = {
                id: data.user.id,
                name: data.user.name,
                email: data.user.email,
                role: data.user.role || 'sales',
                clientId: data.user.clientId || null,
                image: data.user.image || null,
            };
            setUser(userData);
            localStorage.setItem('pl_user', JSON.stringify(userData));
            return { success: true };
        } catch {
            return { success: false, error: 'Gagal terhubung ke server' };
        }
    };

    const logout = async () => {
        try {
            await fetch(`${API_BASE}/auth/sign-out`, {
                method: 'POST',
                credentials: 'include',
            });
        } catch { /* ignore */ }
        setUser(null);
        localStorage.removeItem('pl_user');
    };

    // ─── Role booleans ───────────────────────────────────────────────────
    const isRootAdmin = user?.role === 'root_admin';
    const isClientAdmin = user?.role === 'client_admin';
    const isSupervisor = user?.role === 'supervisor';
    const isSales = user?.role === 'sales';
    const isAdmin = isRootAdmin || isClientAdmin; // backward compat
    const isManager = isRootAdmin || isClientAdmin || isSupervisor; // can see team

    return (
        <AuthContext.Provider value={{
            user, login, logout, loading,
            isRootAdmin, isClientAdmin, isSupervisor, isSales,
            isAdmin, isManager,
            hasMinRole: (minRole) => hasMinRole(user?.role, minRole),
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
};
