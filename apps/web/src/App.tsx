import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';

function TodayPage() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Today's Dinner</h1>
      <p className="text-muted-foreground">Coming soon...</p>
    </div>
  );
}

function WeekPage() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">This Week</h1>
      <p className="text-muted-foreground">Coming soon...</p>
    </div>
  );
}

function DishesPage() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Dishes</h1>
      <p className="text-muted-foreground">Coming soon...</p>
    </div>
  );
}

function HistoryPage() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">History</h1>
      <p className="text-muted-foreground">Coming soon...</p>
    </div>
  );
}

function ProfilePage() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Profile</h1>
      <p className="text-muted-foreground">Coming soon...</p>
    </div>
  );
}

function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Dinner Planner</h1>
          <p className="text-muted-foreground mt-2">Plan your meals</p>
        </div>
        <div className="bg-card p-6 rounded-lg border">
          <p className="text-muted-foreground text-center">Login coming soon...</p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  // TODO: Replace with actual auth check
  const isAuthenticated = true;

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="/today" element={<TodayPage />} />
        <Route path="/week" element={<WeekPage />} />
        <Route path="/dishes" element={<DishesPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>
    </Layout>
  );
}
