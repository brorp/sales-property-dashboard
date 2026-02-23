'use client';

import ProfilePage from '../../src/pages/ProfilePage';
import { ProtectedRoute } from '../../src/components/RouteGuards';

export default function ProfileRoute() {
    return (
        <ProtectedRoute>
            <ProfilePage />
        </ProtectedRoute>
    );
}
