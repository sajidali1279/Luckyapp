import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Billing from './pages/Billing';

const queryClient = new QueryClient();

function ProtectedRoute({ children, devAdminOnly = false }: { children: React.ReactNode; devAdminOnly?: boolean }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (devAdminOnly && user.role !== 'DEV_ADMIN') return <Navigate to="/" replace />;
  // Only employees who are also managers/admins can use the admin panel
  if (['CUSTOMER', 'EMPLOYEE'].includes(user.role)) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/billing" element={<ProtectedRoute devAdminOnly><Billing /></ProtectedRoute>} />
        </Routes>
        <Toaster position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
