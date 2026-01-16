import { NavLink } from 'react-router-dom';
import { Calendar, ChefHat, Clock, Home, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/today', icon: Home, label: 'Today' },
  { to: '/week', icon: Calendar, label: 'Week' },
  { to: '/dishes', icon: ChefHat, label: 'Dishes' },
  { to: '/history', icon: Clock, label: 'History' },
  { to: '/profile', icon: User, label: 'Profile' },
];

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Main content */}
      <main className="flex-1 pb-16 md:pb-0 md:pl-64">{children}</main>

      {/* Mobile bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-background border-t md:hidden">
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
        <nav className="flex-1 p-2">
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
        </nav>
      </aside>
    </div>
  );
}
