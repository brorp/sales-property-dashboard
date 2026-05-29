'use client';

import { AuthProvider } from '../src/context/AuthContext';
import { LeadsProvider } from '../src/context/LeadsContext';
import { TenantProvider } from '../src/context/TenantContext';
import { WorkspaceProvider } from '../src/context/WorkspaceContext';
import { ThemeProvider } from '../src/context/ThemeContext';
import { ToastProvider } from '../src/context/ToastContext';

export default function Providers({ children }) {
    return (
        <ThemeProvider>
            <ToastProvider position="bottom-right">
                <WorkspaceProvider>
                    <TenantProvider>
                        <AuthProvider>
                            <LeadsProvider>{children}</LeadsProvider>
                        </AuthProvider>
                    </TenantProvider>
                </WorkspaceProvider>
            </ToastProvider>
        </ThemeProvider>
    );
}
