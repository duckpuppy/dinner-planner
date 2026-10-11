import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Check, Copy, Monitor, Plus, Trash2 } from 'lucide-react';
import { displayLinks, type DisplayLinkRow } from '@/lib/api';
import { ConfirmDialog } from '@/components/ConfirmDialog';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatLastUsed(iso: string | null): string {
  if (!iso) return 'Never';
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Admin management of read-only kiosk display links (create / copy once / list / revoke). */
export function DisplayLinksSection() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<DisplayLinkRow | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['displayLinks'],
    queryFn: () => displayLinks.list(),
  });

  const createMutation = useMutation({
    mutationFn: () => displayLinks.create({ name: name.trim() }),
    onSuccess: (res) => {
      // The API returns a relative URL; make it absolute so it can be pasted onto the display.
      setCreatedUrl(`${window.location.origin}${res.url}`);
      setCreating(false);
      setName('');
      void queryClient.invalidateQueries({ queryKey: ['displayLinks'] });
    },
    onError: () => toast.error('Failed to create display link'),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => displayLinks.revoke(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['displayLinks'] });
      toast.success('Display link revoked');
      setRevokeTarget(null);
    },
    onError: () => toast.error('Failed to revoke display link'),
  });

  const handleCopy = () => {
    if (!createdUrl) return;
    navigator.clipboard.writeText(createdUrl).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => toast.error('Failed to copy display link')
    );
  };

  const links = data?.displayLinks ?? [];

  return (
    <div className="bg-card border rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-base font-semibold">Display links</h2>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setCreatedUrl(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Create link
          </button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-4 text-pretty">
        Read-only links for a wall tablet or TV showing the week at <code>/kiosk</code>. Anyone with
        a link can see your dinner plan, so revoke it if it is lost.
      </p>

      {creating && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="flex flex-wrap items-end gap-2 mb-4"
        >
          <div className="flex-1 min-w-48">
            <label htmlFor="display-link-name" className="block text-sm font-medium mb-1">
              Name
            </label>
            <input
              id="display-link-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kitchen tablet"
              required
              maxLength={100}
              autoFocus
              className="w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setName('');
            }}
            className="px-4 py-2 text-sm border rounded-md hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending || !name.trim()}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </button>
        </form>
      )}

      {createdUrl && (
        <div className="mb-4 space-y-2" role="status">
          <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-md text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>This link will not be shown again. Copy it now.</span>
          </div>
          <div className="flex items-center gap-2">
            <code
              className="flex-1 min-w-0 px-3 py-2 text-xs bg-muted rounded-md font-mono break-all"
              data-testid="display-link-url"
            >
              {createdUrl}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-md hover:bg-muted"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={() => setCreatedUrl(null)}
              className="px-3 py-2 text-sm border rounded-md hover:bg-muted"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-8 bg-muted rounded" />
          <div className="h-8 bg-muted rounded" />
        </div>
      ) : isError ? (
        <div className="py-4 text-center">
          <p className="text-sm text-destructive mb-2">Failed to load display links.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-sm text-primary underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      ) : links.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No display links yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Name</th>
                <th className="pb-2 pr-4 font-medium">Created</th>
                <th className="pb-2 pr-4 font-medium">Last used</th>
                <th className="pb-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id}>
                  <td className="py-2 pr-4 font-medium">{link.name}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{formatDate(link.createdAt)}</td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {formatLastUsed(link.lastUsedAt)}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setRevokeTarget(link)}
                      className="p-1 text-muted-foreground hover:text-destructive"
                      aria-label={`Revoke display link ${link.name}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
        title="Revoke display link"
        description={`Revoke "${revokeTarget?.name}"? The display using this link will stop working immediately.`}
        confirmText="Revoke"
        variant="destructive"
        loading={revokeMutation.isPending}
        onConfirm={() => revokeTarget && revokeMutation.mutate(revokeTarget.id)}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}
