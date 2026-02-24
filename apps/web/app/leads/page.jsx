'use client';

import LeadsPage from '../../src/screens/LeadsPage';
import { ProtectedRoute } from '../../src/components/RouteGuards';

export default function LeadsRoute() {
    return (
        <ProtectedRoute>
            <LeadsPage />
        </ProtectedRoute>
    );
}
