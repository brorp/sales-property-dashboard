'use client';

import DashboardPage from '../src/pages/DashboardPage';
import { ProtectedRoute } from '../src/components/RouteGuards';

export default function HomePage() {
    return (
        <ProtectedRoute>
            <DashboardPage />
        </ProtectedRoute>
    );
}
