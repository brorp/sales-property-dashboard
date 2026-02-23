import './globals.css';
import Providers from './providers';
import AppShell from '../src/components/AppShell';

export const metadata = {
    title: 'Property Lounge Dashboard',
    description: 'Sales and lead distribution dashboard',
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
