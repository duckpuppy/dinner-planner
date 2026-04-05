import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { apiTokens, type ApiTokenRow } from '@/lib/api';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CreateTokenModal } from '@/components/CreateTokenModal';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ApiTokensSection() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiTokenRow | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['apiTokens'],
    queryFn: () => apiTokens.list(),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiTokens.revoke(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['apiTokens'] });
      toast.success('Token revoked');
      setRevokeTarget(null);
    },
    onError: () => {
      toast.error('Failed to revoke token');
    },
  });

  const tokens = data?.tokens ?? [];

  return (
    <div className="bg-card border rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">API Tokens</h2>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" />
          Create Token
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-8 bg-muted rounded" />
          <div className="h-8 bg-muted rounded" />
        </div>
      ) : isError ? (
        <div className="py-4 text-center">
          <p className="text-sm text-destructive mb-2">Failed to load API tokens.</p>
          <button
            onClick={() => void refetch()}
            className="text-sm text-primary underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No API tokens yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Name</th>
                <th className="pb-2 pr-4 font-medium">Created</th>
                <th className="pb-2 pr-4 font-medium">Last Used</th>
                <th className="pb-2 pr-4 font-medium">Expires</th>
                <th className="pb-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => (
                <tr
                  key={token.id}
                  className={
                    revokeMutation.isPending && revokeMutation.variables === token.id
                      ? 'opacity-50'
                      : ''
                  }
                >
                  <td className="py-2 pr-4 font-medium">{token.name}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{formatDate(token.createdAt)}</td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {formatRelative(token.lastUsedAt)}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {token.expiresAt ? formatDate(token.expiresAt) : 'Never'}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => setRevokeTarget(token)}
                      disabled={revokeMutation.isPending && revokeMutation.variables === token.id}
                      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                      title="Revoke token"
                      aria-label={`Revoke token ${token.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreateTokenModal onClose={() => setShowCreate(false)} />}

      <ConfirmDialog
        open={revokeTarget !== null}
        title="Revoke token"
        description={`Revoke "${revokeTarget?.name}"? Any scripts or services using this token will stop working immediately.`}
        confirmText="Revoke"
        variant="destructive"
        loading={revokeMutation.isPending}
        onConfirm={() => revokeTarget && revokeMutation.mutate(revokeTarget.id)}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}
