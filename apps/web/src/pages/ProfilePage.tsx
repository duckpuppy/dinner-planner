import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { users, ApiError } from '@/lib/api';
import { LogOut, Key, User } from 'lucide-react';

export function ProfilePage() {
  const { user, logout } = useAuthStore();
  const [showPasswordForm, setShowPasswordForm] = useState(false);

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

      {/* Change password */}
      {showPasswordForm ? (
        <ChangePasswordForm
          userId={user.id}
          onClose={() => setShowPasswordForm(false)}
        />
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
      setSuccess(true);
      setTimeout(onClose, 1500);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to change password');
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
      <div className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400
                      p-4 rounded-lg mb-4 text-center">
        Password changed successfully!
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card border rounded-lg p-4 mb-4 space-y-4">
      <h2 className="font-semibold">Change Password</h2>

      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
          {error}
        </div>
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
