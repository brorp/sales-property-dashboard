import './globals.css';
import Providers from './providers';
import AppShell from '../src/components/AppShell';

export const metadata = {
    title: 'CRM Widari',
    description: 'Sales management panel for Widari',
    icons: {
        icon: '/favicon.ico',
    },
};

export default function RootLayout({ children }) {
    return (
        <html lang="id">
            <body>
                <Providers>
                    <AppShell>{children}</AppShell>
                </Providers>
            </body>
        </html>
    );
}
