'use client';

import { AuthProvider } from '../src/context/AuthContext';
import { LeadsProvider } from '../src/context/LeadsContext';
import { TenantProvider } from '../src/context/TenantContext';
import { WorkspaceProvider } from '../src/context/WorkspaceContext';
import { ThemeProvider } from '../src/context/ThemeContext';

export default function Providers({ children }) {
    return (
        <ThemeProvider>
            <WorkspaceProvider>
                <TenantProvider>
                    <AuthProvider>
                        <LeadsProvider>{children}</LeadsProvider>
                    </AuthProvider>
                </TenantProvider>
            </WorkspaceProvider>
        </ThemeProvider>
    );
}
