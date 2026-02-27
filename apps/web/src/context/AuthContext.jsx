'use client';

import { createContext, useContext, useState, useEffect } from 'react';

const LOGIN_USERS = [
    {
        id: 'seed-admin',
        name: 'Super Admin',
        email: 'admin@propertylounge.id',
        password: 'admin123',
        role: 'admin',
    },
    {
        id: 'seed-sales-ryan',
        name: 'Ryan Pratama',
        email: 'ryan.pratama@propertylounge.id',
        password: 'sales123',
        role: 'sales',
    },
    {
        id: 'seed-sales-rachmat',
        name: 'Rachmat',
        email: 'rachmat@propertylounge.id',
        password: 'sales123',
        role: 'sales',
    },
    {
        id: 'seed-sales-nicky',
        name: 'Nicky Robert',
        email: 'nicky.robert@propertylounge.id',
        password: 'sales123',
        role: 'sales',
    },
];

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const saved = localStorage.getItem('pl_user');
        if (saved) {
            try { setUser(JSON.parse(saved)); } catch { /* ignore */ }
        }
        setLoading(false);
    }, []);

    const login = (email, password) => {
        const found = LOGIN_USERS.find(u => u.email === email && u.password === password);
        if (!found) return { success: false, error: 'Email atau password salah' };
        const userData = { id: found.id, name: found.name, email: found.email, role: found.role };
        setUser(userData);
        localStorage.setItem('pl_user', JSON.stringify(userData));
        return { success: true };
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('pl_user');
    };

    const updateCurrentUser = (patch) => {
        setUser((prev) => {
            if (!prev) {
                return prev;
            }
            const next = { ...prev, ...patch };
            localStorage.setItem('pl_user', JSON.stringify(next));
            return next;
        });
    };

    const isAdmin = user?.role === 'admin';

    return (
        <AuthContext.Provider value={{ user, login, logout, loading, isAdmin, updateCurrentUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
};
