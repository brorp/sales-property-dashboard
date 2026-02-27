'use client';

import { ProtectedRoute } from '../../src/components/RouteGuards';
import AppointmentsPage from '../../src/screens/AppointmentsPage';

export default function AppointmentsRoute() {
    return (
        <ProtectedRoute>
            <AppointmentsPage />
        </ProtectedRoute>
    );
}
