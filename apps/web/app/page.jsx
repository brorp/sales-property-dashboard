'use client';

import DashboardPage from '../src/screens/DashboardPage';
import { ProtectedRoute } from '../src/components/RouteGuards';

export default function HomePage() {
    return (
        <ProtectedRoute>
            <DashboardPage />
        </ProtectedRoute>
    );
}
