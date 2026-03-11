import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import BottomNav from './components/BottomNav';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LeadsPage from './pages/LeadsPage';
import LeadDetailPage from './pages/LeadDetailPage';
import TeamPage from './pages/TeamPage';
import ProfilePage from './pages/ProfilePage';
import ClientsPage from './pages/ClientsPage';

function ProtectedRoute({ children }) {
    const { user, loading } = useAuth();
    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;
    return children;
}

function ManagerRoute({ children }) {
    const { user, loading, isManager } = useAuth();
    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;
    if (!isManager) return <Navigate to="/" replace />;
    return children;
}

function RootAdminRoute({ children }) {
    const { user, loading, isRootAdmin } = useAuth();
    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;
    if (!isRootAdmin) return <Navigate to="/" replace />;
    return children;
}

export default function App() {
    const { user } = useAuth();

    return (
        <>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                <Route path="/leads" element={<ProtectedRoute><LeadsPage /></ProtectedRoute>} />
                <Route path="/leads/:id" element={<ProtectedRoute><LeadDetailPage /></ProtectedRoute>} />
                <Route path="/team" element={<ManagerRoute><TeamPage /></ManagerRoute>} />
                <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                <Route path="/clients" element={<RootAdminRoute><ClientsPage /></RootAdminRoute>} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            {user && <BottomNav />}
        </>
    );
}
