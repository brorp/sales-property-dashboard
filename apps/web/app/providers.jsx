'use client';

import { AuthProvider } from '../src/context/AuthContext';
import { LeadsProvider } from '../src/context/LeadsContext';

export default function Providers({ children }) {
    return (
        <AuthProvider>
            <LeadsProvider>{children}</LeadsProvider>
        </AuthProvider>
    );
}
