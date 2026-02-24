import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';
import { users, ApiError, DIETARY_TAGS } from '@/lib/api';
import { LogOut, Key, User, Sun, Moon, Calendar, CalendarDays } from 'lucide-react';

const DIETARY_TAG_LABELS: Record<string, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  gluten_free: 'Gluten-Free',
  dairy_free: 'Dairy-Free',
  nut_free: 'Nut-Free',
  low_carb: 'Low-Carb',
};

export function ProfilePage() {
  const { user, logout, updateUser } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const updatePreferencesMutation = useMutation({
    mutationFn: (data: {
      theme?: 'light' | 'dark';
      homeView?: 'today' | 'week';
      dietaryPreferences?: string[];
    }) => users.updatePreferences(user!.id, data),
    onSuccess: (result) => {
      updateUser(result.user);
      toast.success('Preferences updated');
    },
    onError: () => {
      toast.error('Failed to update preferences');
    },
  });

  const handleThemeToggle = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    updatePreferencesMutation.mutate({ theme: newTheme });
  };

  const handleHomeViewToggle = (view: 'today' | 'week') => {
    updateUser({ homeView: view });
    updatePreferencesMutation.mutate({ homeView: view });
  };

  const handleDietaryPreferenceToggle = (tag: string) => {
    const current = user!.dietaryPreferences ?? [];
    const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
    updateUser({ dietaryPreferences: next });
    updatePreferencesMutation.mutate({ dietaryPreferences: next });
  };

  if (!user) return null;

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-6">Profile</h1>

      {/* User info */}
      <div className="bg-card border rounded-lg p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <User className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <div className="font-semibold">{user.displayName}</div>
            <div className="text-sm text-muted-foreground">@{user.username}</div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            Role: <span className="text-foreground capitalize">{user.role}</span>
          </div>
        </div>
      </div>

      {/* Preferences */}
      <div className="bg-card border rounded-lg p-4 mb-6 space-y-4">
        <h2 className="font-semibold">Preferences</h2>

        {/* Theme toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {theme === 'light' ? (
              <Sun className="h-5 w-5 text-muted-foreground" />
            ) : (
              <Moon className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="text-sm">Theme</span>
          </div>
          <button
            onClick={handleThemeToggle}
            className="px-3 py-1.5 border rounded-md hover:bg-muted text-sm"
          >
            {theme === 'light' ? 'Light' : 'Dark'}
          </button>
        </div>

        {/* Home view toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {user.homeView === 'today' ? (
              <Calendar className="h-5 w-5 text-muted-foreground" />
            ) : (
              <CalendarDays className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="text-sm">Home View</span>
          </div>
          <div className="flex items-center gap-1 border rounded-md p-1">
            <button
              onClick={() => handleHomeViewToggle('today')}
              className={`px-2 py-1 text-sm rounded ${
                user.homeView === 'today'
                  ? 'bg-secondary text-secondary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => handleHomeViewToggle('week')}
              className={`px-2 py-1 text-sm rounded ${
                user.homeView === 'week'
                  ? 'bg-secondary text-secondary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              Week
            </button>
          </div>
        </div>

        {/* Dietary preferences */}
        <div>
          <p className="text-sm font-medium mb-2">Dietary Preferences</p>
          <fieldset>
            <legend className="sr-only">Dietary preferences</legend>
            <div className="grid grid-cols-2 gap-2">
              {DIETARY_TAGS.map((tag) => (
                <label
                  key={tag}
                  className="flex items-center gap-2 text-sm cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={(user.dietaryPreferences ?? []).includes(tag)}
                    onChange={() => handleDietaryPreferenceToggle(tag)}
                    className="rounded border-input"
                    disabled={updatePreferencesMutation.isPending}
                  />
                  {DIETARY_TAG_LABELS[tag]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>

      {/* Change password */}
      {showPasswordForm ? (
        <ChangePasswordForm userId={user.id} onClose={() => setShowPasswordForm(false)} />
      ) : (
        <button
          onClick={() => setShowPasswordForm(true)}
          className="w-full flex items-center gap-3 p-4 border rounded-lg hover:bg-muted mb-4"
        >
          <Key className="h-5 w-5 text-muted-foreground" />
          <span>Change Password</span>
        </button>
      )}

      {/* Logout */}
      <button
        onClick={logout}
        className="w-full flex items-center gap-3 p-4 border rounded-lg hover:bg-muted
                   text-destructive hover:text-destructive"
      >
        <LogOut className="h-5 w-5" />
        <span>Sign Out</span>
      </button>
    </div>
  );
}

function ChangePasswordForm({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: () => users.changePassword(userId, currentPassword, newPassword),
    onSuccess: () => {
      toast.success('Password changed successfully');
      setSuccess(true);
      setTimeout(onClose, 1500);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setError(err.message);
        toast.error(err.message);
      } else {
        setError('Failed to change password');
        toast.error('Failed to change password');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    mutation.mutate();
  };

  if (success) {
    return (
      <div
        className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400
                      p-4 rounded-lg mb-4 text-center"
      >
        Password changed successfully!
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card border rounded-lg p-4 mb-4 space-y-4">
      <h2 className="font-semibold">Change Password</h2>

      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Current Password</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          className="w-full px-3 py-2 border rounded-md bg-background"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">New Password</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
          className="w-full px-3 py-2 border rounded-md bg-background"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Confirm New Password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          className="w-full px-3 py-2 border rounded-md bg-background"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="flex-1 py-2 px-4 bg-primary text-primary-foreground rounded-md
                     font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {mutation.isPending ? 'Changing...' : 'Change Password'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="py-2 px-4 border rounded-md hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
