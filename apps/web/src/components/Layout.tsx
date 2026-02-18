import { NavLink } from 'react-router-dom';
import { Calendar, ChefHat, Clock, Home, User, Users, Settings, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';

const navItems = [
  { to: '/today', icon: Home, label: 'Today' },
  { to: '/week', icon: Calendar, label: 'Week' },
  { to: '/dishes', icon: ChefHat, label: 'Dishes' },
  { to: '/history', icon: Clock, label: 'History' },
  { to: '/profile', icon: User, label: 'Profile' },
];

const adminItems = [
  { to: '/admin/users', icon: Users, label: 'Users' },
  { to: '/admin/settings', icon: Settings, label: 'Settings' },
];

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  return (
    <div className="min-h-screen flex flex-col" style={{ paddingTop: 'var(--sat)' }}>
      {/* Main content */}
      <main className="flex-1 pb-16 md:pb-0 md:pl-64">{children}</main>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-background border-t md:hidden"
        style={{ paddingBottom: 'var(--sab)' }}
      >
        <div className="flex justify-around">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center py-2 px-3 text-xs',
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
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 flex-col bg-background border-r">
        <div className="p-4 border-b">
          <h1 className="text-xl font-bold">Dinner Planner</h1>
        </div>
        <nav className="flex-1 p-2 space-y-6">
          <div>
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm',
                    isActive
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                  )
                }
              >
                <Icon className="h-5 w-5" />
                {label}
              </NavLink>
            ))}
          </div>

          {isAdmin && (
            <div>
              <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Admin
              </div>
              {adminItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm',
                      isActive
                        ? 'bg-secondary text-secondary-foreground'
                        : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                    )
                  }
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </NavLink>
              ))}
            </div>
          )}
        </nav>

        {/* Sidebar footer: user info + logout */}
        <div className="p-3 border-t space-y-1">
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm w-full',
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
            <span className="truncate">{user?.displayName}</span>
          </NavLink>
          <button
            onClick={() => logout()}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm w-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            Sign out
          </button>
        </div>
      </aside>
    </div>
  );
}
