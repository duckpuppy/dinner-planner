import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { admin, ApiError, type AdminUser } from '@/lib/api';
import { ShieldCheck, Home, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { SkeletonList } from '@/components/Skeleton';
import { ErrorState } from '@/components/ErrorState';

export function SuperAdminPage() {
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);

  const familiesQuery = useQuery({
    queryKey: ['admin', 'families'],
    queryFn: () => admin.listFamilies(),
  });

  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => admin.listUsers(),
  });

  const familiesList = familiesQuery.data?.families ?? [];
  const usersList = usersQuery.data?.users ?? [];

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Super Admin</h1>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Home className="h-4 w-4 text-muted-foreground" />
          Families
        </h2>
        {familiesQuery.isLoading ? (
          <SkeletonList count={3} />
        ) : familiesQuery.isError ? (
          <ErrorState
            message="Failed to load families. Please try again."
            error={familiesQuery.error as Error}
            onRetry={() => familiesQuery.refetch()}
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Members</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {familiesList.map((family) => (
                  <tr key={family.id}>
                    <td className="px-4 py-2">{family.name}</td>
                    <td className="px-4 py-2 tabular-nums">{family.memberCount}</td>
                  </tr>
                ))}
                {familiesList.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-muted-foreground">
                      No families found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">All Users</h2>
        {usersQuery.isLoading ? (
          <SkeletonList count={5} />
        ) : usersQuery.isError ? (
          <ErrorState
            message="Failed to load users. Please try again."
            error={usersQuery.error as Error}
            onRetry={() => usersQuery.refetch()}
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">User</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="px-4 py-2 font-medium">Family</th>
                  <th className="px-4 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {usersList.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-2">
                      <div className="font-medium">{user.displayName}</div>
                      <div className="text-xs text-muted-foreground">@{user.username}</div>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          user.role === 'admin'
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-2">{user.familyName}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => setEditingUser(user)}
                        className="p-3 md:p-2 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground touch-manipulation"
                        aria-label={`Edit ${user.displayName}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {usersList.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editingUser && (
        <EditUserDialog
          user={editingUser}
          families={familiesList}
          onClose={() => setEditingUser(null)}
        />
      )}
    </div>
  );
}

function EditUserDialog({
  user,
  families,
  onClose,
}: {
  user: AdminUser;
  families: { id: string; name: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [familyId, setFamilyId] = useState(user.familyId);
  const [role, setRole] = useState<'admin' | 'member'>(user.role);
  const [formError, setFormError] = useState('');

  const updateMutation = useMutation({
    mutationFn: () => admin.updateUser(user.id, { familyId, role }),
    onSuccess: () => {
      toast.success('User updated successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'families'] });
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
        setFormError(err.message);
        return;
      }
      setFormError('');
      toast.error('Failed to update user');
      console.error('Error updating user:', err);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    updateMutation.mutate();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-user-title"
    >
      <div className="bg-background border rounded-lg max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 id="edit-user-title" className="text-xl font-bold">
            Edit {user.displayName}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-2 hover:bg-muted rounded-md"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="edit-user-family" className="block text-sm font-medium mb-1">
              Family
            </label>
            <select
              id="edit-user-family"
              value={familyId}
              onChange={(e) => setFamilyId(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              {families.map((family) => (
                <option key={family.id} value={family.id}>
                  {family.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="edit-user-role" className="block text-sm font-medium mb-1">
              Role
            </label>
            <select
              id="edit-user-role"
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'member')}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {formError && (
            <p role="alert" className="text-destructive text-sm">
              {formError}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="flex-1 py-2 px-4 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={updateMutation.isPending}
              className="py-2 px-4 border rounded-md hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
