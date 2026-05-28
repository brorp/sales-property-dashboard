import './globals.css';
import { headers } from 'next/headers';
import Providers from './providers';
import AppShell from '../src/components/AppShell';
import { buildCrmTitleFromHost } from '../src/lib/crm-title';

export function generateMetadata() {
    const headersList = headers();
    const host = headersList.get('x-forwarded-host') || headersList.get('host') || '';
    const title = buildCrmTitleFromHost(host);

    return {
        title,
        description: `${title} dashboard`,
        icons: {
            icon: '/favicon.ico',
        },
    };
}

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
