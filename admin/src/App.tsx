import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import Navbar from './components/Navbar';
import PageLoader from './components/PageLoader';

// Eagerly loaded (always needed)
import Login from './pages/Login';

// Lazy loaded (code-split per page)
const Dashboard              = lazy(() => import('./pages/Dashboard'));
const StoreManagerDashboard  = lazy(() => import('./pages/StoreManagerDashboard'));
const Billing                = lazy(() => import('./pages/Billing'));
const Analytics              = lazy(() => import('./pages/Analytics'));
const Offers                 = lazy(() => import('./pages/Offers'));
const Banners                = lazy(() => import('./pages/Banners'));
const Transactions           = lazy(() => import('./pages/Transactions'));
const Staff                  = lazy(() => import('./pages/Staff'));
const Customers              = lazy(() => import('./pages/Customers'));
const ActivityLog            = lazy(() => import('./pages/ActivityLog'));
const SuperAdminBilling      = lazy(() => import('./pages/SuperAdminBilling'));
const Notifications          = lazy(() => import('./pages/Notifications'));
const Stores                 = lazy(() => import('./pages/Stores'));
const Scheduling             = lazy(() => import('./pages/Scheduling'));
const Chat                   = lazy(() => import('./pages/Chat'));
const StoreRequests          = lazy(() => import('./pages/StoreRequests'));
const Profile                = lazy(() => import('./pages/Profile'));
const Catalog                = lazy(() => import('./pages/Catalog'));
const BusinessPromotions     = lazy(() => import('./pages/BusinessPromotions'));

const queryClient = new QueryClient();

const ADMIN_ROLES = ['DEV_ADMIN', 'SUPER_ADMIN', 'STORE_MANAGER'];

function ProtectedLayout() {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (!ADMIN_ROLES.includes(user.role)) return <Navigate to="/login" replace />;
  return (
    <>
      <Navbar />
      <Outlet />
    </>
  );
}

function DashboardRoute() {
  const { user } = useAuthStore();
  if (user?.role === 'STORE_MANAGER') return <StoreManagerDashboard />;
  return <Dashboard />;
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
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedLayout />}>
              <Route path="/" element={<DashboardRoute />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/staff" element={<Staff />} />
              <Route path="/offers" element={<Offers />} />
              <Route path="/banners" element={<Banners />} />
              <Route element={<SuperAdminOnly />}>
                <Route path="/customers" element={<Customers />} />
                <Route path="/my-billing" element={<SuperAdminBilling />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/scheduling" element={<Scheduling />} />
              </Route>
              {/* Catalog accessible to both SuperAdmin and DevAdmin */}
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/store-requests" element={<StoreRequests />} />
              <Route path="/profile" element={<Profile />} />
              <Route element={<DevAdminOnly />}>
                <Route path="/billing" element={<Billing />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/activity" element={<ActivityLog />} />
                <Route path="/stores" element={<Stores />} />
                <Route path="/promotions" element={<BusinessPromotions />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <Toaster position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
