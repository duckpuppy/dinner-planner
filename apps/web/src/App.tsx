import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Layout } from './components/Layout';
import { useAuthStore } from './stores/auth';
import { useThemeStore } from './stores/theme';
import { LoginPage } from './pages/LoginPage';
import { TodayPage } from './pages/TodayPage';
import { WeekPage } from './pages/WeekPage';
import { DishesPage } from './pages/DishesPage';
import { HistoryPage } from './pages/HistoryPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AdminSettingsPage } from './pages/AdminSettingsPage';

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
        <p className="mt-4 text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

function HomeRedirect() {
  const user = useAuthStore((s) => s.user);
  const target = user?.homeView === 'week' ? '/week' : '/today';
  return <Navigate to={target} replace />;
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { isAuthenticated, isLoading, checkAuth, user } = useAuthStore();
  const initTheme = useThemeStore((s) => s.initTheme);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (user) {
      initTheme(user.theme);
    }
  }, [user, initTheme]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return (
      <>
        <Toaster richColors position="top-right" />
        <LoginPage />
      </>
    );
  }

  return (
    <>
      <Toaster richColors position="top-right" />
      <Layout>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/today" element={<TodayPage />} />
          <Route path="/week" element={<WeekPage />} />
          <Route path="/dishes" element={<DishesPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route
            path="/admin/users"
            element={
              <AdminGuard>
                <AdminUsersPage />
              </AdminGuard>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <AdminGuard>
                <AdminSettingsPage />
              </AdminGuard>
            }
          />
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </Layout>
    </>
  );
}
