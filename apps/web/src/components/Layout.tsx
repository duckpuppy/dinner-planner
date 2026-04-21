import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Activity,
  Calendar,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Clock,
  Home,
  LogOut,
  Package,
  ScrollText,
  Settings,
  ShoppingCart,
  User,
  Users,
  UtensilsCrossed,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';

const navItems = [
  { to: '/today', icon: Home, label: 'Today' },
  { to: '/week', icon: Calendar, label: 'Week' },
  { to: '/dishes', icon: ChefHat, label: 'Dishes' },
  { to: '/restaurants', icon: UtensilsCrossed, label: 'Restaurants' },
  { to: '/grocery', icon: ShoppingCart, label: 'Grocery' },
  { to: '/pantry', icon: Package, label: 'Pantry' },
  { to: '/history', icon: Clock, label: 'History' },
  { to: '/patterns', icon: Zap, label: 'Patterns' },
  { to: '/profile', icon: User, label: 'Profile' },
];

const adminItems = [
  { to: '/admin/users', icon: Users, label: 'Users' },
  { to: '/admin/settings', icon: Settings, label: 'Settings' },
  { to: '/admin/logs', icon: ScrollText, label: 'Logs' },
  { to: '/admin/health', icon: Activity, label: 'Health' },
];

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem('sidebarCollapsed') === 'true'
  );

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem('sidebarCollapsed', String(!prev));
      return !prev;
    });
  };

  const navLinkClass = (isActive: boolean) =>
    cn(
      'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
      collapsed && 'justify-center px-2',
      isActive
        ? 'bg-secondary text-secondary-foreground'
        : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
    );

  return (
    <div className="min-h-screen flex flex-col" style={{ paddingTop: 'var(--sat)' }}>
      {/* Main content */}
      <main className={cn('flex-1 pb-16 md:pb-0', collapsed ? 'md:pl-16' : 'md:pl-64')}>
        {children}
      </main>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-background border-t md:hidden"
        style={{ paddingBottom: 'var(--sab)' }}
      >
        <div className="flex overflow-x-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center py-2 px-3 text-xs flex-shrink-0',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )
              }
            >
              <Icon className="h-5 w-5 mb-1" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden md:flex fixed left-0 top-0 bottom-0 flex-col bg-background border-r transition-all duration-200',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Header */}
        <div className={cn('p-4 border-b flex items-center', collapsed ? 'justify-center' : '')}>
          {collapsed ? (
            <ChefHat className="h-6 w-6 text-primary" />
          ) : (
            <h1 className="text-xl font-bold">Dinner Planner</h1>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-6 overflow-y-auto">
          <div>
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                title={collapsed ? label : undefined}
                className={({ isActive }) => navLinkClass(isActive)}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && label}
              </NavLink>
            ))}
          </div>

          {isAdmin && (
            <div>
              {!collapsed && (
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Admin
                </div>
              )}
              {adminItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  title={collapsed ? label : undefined}
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {!collapsed && label}
                </NavLink>
              ))}
            </div>
          )}
        </nav>

        {/* Version */}
        {!collapsed && (
          <div className="px-4 py-1 text-xs text-muted-foreground/50 select-none">
            v{__APP_VERSION__}
          </div>
        )}

        {/* Footer: user + logout */}
        <div className="p-3 border-t space-y-1">
          <NavLink
            to="/profile"
            title={collapsed ? (user?.displayName ?? 'Profile') : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm w-full transition-colors',
                collapsed && 'justify-center px-2',
                isActive
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
              )
            }
          >
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-medium text-primary">
                {user?.displayName?.[0]?.toUpperCase() ?? '?'}
              </span>
            </div>
            {!collapsed && <span className="truncate">{user?.displayName}</span>}
          </NavLink>

          <button
            onClick={() => logout()}
            title={collapsed ? 'Sign out' : undefined}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm w-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors',
              collapsed && 'justify-center px-2'
            )}
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            {!collapsed && 'Sign out'}
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="p-3 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted border-t transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </aside>
    </div>
  );
}
