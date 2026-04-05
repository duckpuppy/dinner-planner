import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X, Copy, Check, AlertTriangle } from 'lucide-react';
import { apiTokens } from '@/lib/api';

interface CreateTokenModalProps {
  onClose: () => void;
}

export function CreateTokenModal({ onClose }: CreateTokenModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (createdToken) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onClose, createdToken]);

  const createMutation = useMutation({
    mutationFn: () =>
      apiTokens.create({
        name: name.trim(),
        ...(expiresAt ? { expiresAt } : {}),
      }),
    onSuccess: (data) => {
      setCreatedToken(data.token);
    },
    onError: () => {
      toast.error('Failed to create API token');
    },
  });

  const handleDone = () => {
    void queryClient.invalidateQueries({ queryKey: ['apiTokens'] });
    onClose();
  };

  const handleCopy = () => {
    if (!createdToken) return;
    void navigator.clipboard.writeText(createdToken).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={createdToken ? undefined : onClose} />
      <div className="relative bg-card border rounded-lg shadow-lg mx-4 w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-base font-semibold">
            {createdToken ? 'Token Created' : 'Create API Token'}
          </h2>
          {!createdToken && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {createdToken ? (
          <div className="p-4 space-y-4">
            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-md text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>This token will not be shown again. Copy it now.</span>
            </div>
            <div className="relative">
              <code className="block w-full px-3 py-2 pr-10 text-xs bg-muted rounded-md font-mono break-all">
                {createdToken}
              </code>
              <button
                onClick={handleCopy}
                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                title="Copy token"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleDone}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Home Assistant, scripts"
                required
                autoFocus
                maxLength={100}
                className="w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Expires{' '}
                <span className="text-muted-foreground font-normal">
                  (optional — leave blank for never)
                </span>
              </label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm border rounded-md hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || !name.trim()}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Token'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
