import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { BrandingProvider } from './context/BrandingContext';
import api from './api/client';
import Layout from './components/Layout';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import Attendance from './pages/Attendance';
import Users from './pages/Users';
import Reports from './pages/Reports';
import SettingsBranding from './pages/SettingsBranding';
import SettingsSmtp from './pages/SettingsSmtp';
import AuditLog from './pages/AuditLog';

function PrivateRoute({ children, roles }: { children: JSX.Element; roles?: string[] }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex h-screen items-center justify-center text-gray-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, isLoading } = useAuth();
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);

  useEffect(() => {
    api.get('/setup/status')
      .then(res => setSetupRequired(res.data.required))
      .catch(() => setSetupRequired(false));
  }, []);

  if (isLoading || setupRequired === null) {
    return <div className="flex h-screen items-center justify-center text-gray-500">Loading...</div>;
  }

  if (setupRequired) {
    return <Setup onComplete={() => setSetupRequired(false)} />;
  }

  return (
    <BrandingProvider>
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="users" element={<PrivateRoute roles={['admin']}><Users /></PrivateRoute>} />
        <Route path="reports" element={<PrivateRoute roles={['admin']}><Reports /></PrivateRoute>} />
        <Route path="settings" element={<PrivateRoute roles={['admin']}><Navigate to="/settings/branding" replace /></PrivateRoute>} />
        <Route path="settings/branding" element={<PrivateRoute roles={['admin']}><SettingsBranding /></PrivateRoute>} />
        <Route path="settings/smtp" element={<PrivateRoute roles={['admin']}><SettingsSmtp /></PrivateRoute>} />
        <Route path="audit" element={<PrivateRoute roles={['admin']}><AuditLog /></PrivateRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </BrandingProvider>
  );
}
