import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Billing from './pages/Billing';
import Offers from './pages/Offers';
import Banners from './pages/Banners';
import Transactions from './pages/Transactions';
import Staff from './pages/Staff';

const queryClient = new QueryClient();

function ProtectedLayout() {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (['CUSTOMER', 'EMPLOYEE'].includes(user.role)) return <Navigate to="/login" replace />;
  return (
    <>
      <Navbar />
      <Outlet />
    </>
  );
}

function DevAdminOnly() {
  const { user } = useAuthStore();
  if (user?.role !== 'DEV_ADMIN') return <Navigate to="/" replace />;
  return <Outlet />;
}

function SuperAdminOnly() {
  const { user } = useAuthStore();
  if (!['DEV_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '')) return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/staff" element={<Staff />} />
            <Route element={<SuperAdminOnly />}>
              <Route path="/offers" element={<Offers />} />
              <Route path="/banners" element={<Banners />} />
            </Route>
            <Route element={<DevAdminOnly />}>
              <Route path="/billing" element={<Billing />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
