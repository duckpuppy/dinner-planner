import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Plus, Trash2, AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';
import { pantry as pantryApi, type PantryItem } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PullToRefresh } from '@/components/mobile/PullToRefresh';
import { SkeletonList } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SwipeableListItem } from '@/components/mobile/SwipeableListItem';
import { useSwipeActions } from '@/hooks/useSwipeActions';

function getExpiryStatus(expiresAt: string | null): 'expired' | 'soon' | 'ok' | null {
  if (!expiresAt) return null;
  // Compare date strings directly to avoid timezone shift (YYYY-MM-DD is date-only)
  const todayStr = new Date().toISOString().split('T')[0];
  if (expiresAt < todayStr) return 'expired';
  const soon = new Date();
  soon.setDate(soon.getDate() + 7);
  const soonStr = soon.toISOString().split('T')[0];
  if (expiresAt <= soonStr) return 'soon';
  return 'ok';
}

function formatExpiryDate(expiresAt: string): string {
  return new Date(expiresAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function sortByExpiry(items: PantryItem[]): PantryItem[] {
  return items.slice().sort((a, b) => {
    if (a.expiresAt && b.expiresAt) {
      return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
    }
    if (a.expiresAt) return -1;
    if (b.expiresAt) return 1;
    return a.ingredientName.localeCompare(b.ingredientName);
  });
}

interface AddItemFormProps {
  onClose: () => void;
  onAdded: () => void;
}

function AddItemForm({ onClose, onAdded }: AddItemFormProps) {
  const [ingredientName, setIngredientName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      pantryApi.create({
        ingredientName: ingredientName.trim(),
        quantity: quantity !== '' ? Number(quantity) : null,
        unit: unit.trim() || null,
        expiresAt: expiresAt || null,
      }),
    onSuccess: () => {
      toast.success('Item added to pantry');
      onAdded();
    },
    onError: () => {
      toast.error('Failed to add item');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ingredientName.trim()) return;
    mutation.mutate();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border bg-card p-4 space-y-3"
      aria-label="Add pantry item"
    >
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold">Add Item</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close add item form"
          className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div>
        <label htmlFor="pantry-name" className="block text-xs font-medium mb-1">
          Ingredient <span aria-hidden="true">*</span>
        </label>
        <input
          id="pantry-name"
          type="text"
          required
          autoFocus
          value={ingredientName}
          onChange={(e) => setIngredientName(e.target.value)}
          placeholder="e.g. Olive oil"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="pantry-qty" className="block text-xs font-medium mb-1">
            Quantity
          </label>
          <input
            id="pantry-qty"
            type="number"
            min="0.01"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g. 2"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label htmlFor="pantry-unit" className="block text-xs font-medium mb-1">
            Unit
          </label>
          <input
            id="pantry-unit"
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="e.g. cups"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div>
        <label htmlFor="pantry-expires" className="block text-xs font-medium mb-1">
          Expires
        </label>
        <input
          id="pantry-expires"
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <button
        type="submit"
        disabled={mutation.isPending || !ingredientName.trim()}
        className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {mutation.isPending ? 'Adding…' : 'Add to Pantry'}
      </button>
    </form>
  );
}

interface PantryRowProps {
  item: PantryItem;
  onDelete: (item: PantryItem) => void;
  activeItemId: string | null;
  onSwipeStart: (itemId: string) => void;
  onSwipeEnd: () => void;
}

function PantryRow({ item, onDelete, activeItemId, onSwipeStart, onSwipeEnd }: PantryRowProps) {
  const expiryStatus = getExpiryStatus(item.expiresAt);

  return (
    <SwipeableListItem
      itemId={item.id}
      activeItemId={activeItemId}
      onSwipeStart={onSwipeStart}
      onSwipeEnd={onSwipeEnd}
      actions={[
        {
          icon: Trash2,
          label: 'Delete',
          color: 'destructive',
          onAction: () => onDelete(item),
        },
      ]}
    >
      <div className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 w-full">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium block truncate">{item.ingredientName}</span>
          {(item.quantity !== null || item.unit) && (
            <span className="text-xs text-muted-foreground">
              {item.quantity !== null && <span className="tabular-nums">{item.quantity}</span>}
              {item.quantity !== null && item.unit && ' '}
              {item.unit}
            </span>
          )}
        </div>

        {item.expiresAt && (
          <span
            className={cn(
              'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full flex-shrink-0',
              expiryStatus === 'expired' && 'bg-destructive/10 text-destructive',
              expiryStatus === 'soon' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
              expiryStatus === 'ok' && 'bg-muted text-muted-foreground'
            )}
          >
            {(expiryStatus === 'expired' || expiryStatus === 'soon') && (
              <AlertTriangle className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            )}
            {expiryStatus === 'expired' ? 'Expired ' : 'Expires '}
            {formatExpiryDate(item.expiresAt)}
          </span>
        )}

        <button
          onClick={() => onDelete(item)}
          aria-label={`Delete ${item.ingredientName} from pantry`}
          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-destructive flex-shrink-0 hidden md:flex"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </SwipeableListItem>
  );
}

export function PantryPage() {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<PantryItem | null>(null);
  const { activeItemId, openSwipe, closeSwipe } = useSwipeActions();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['pantry'],
    queryFn: () => pantryApi.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => pantryApi.delete(id),
    onSuccess: () => {
      toast.success('Item removed from pantry');
      queryClient.invalidateQueries({ queryKey: ['pantry'] });
      queryClient.invalidateQueries({ queryKey: ['groceries'] });
      setItemToDelete(null);
    },
    onError: () => {
      toast.error('Failed to remove item');
    },
  });

  const items = sortByExpiry(data?.items ?? []);

  function handleAdded() {
    setShowAddForm(false);
    queryClient.invalidateQueries({ queryKey: ['pantry'] });
    queryClient.invalidateQueries({ queryKey: ['groceries'] });
  }

  async function handleRefresh() {
    await refetch();
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="p-4 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-balance">Pantry</h1>
          </div>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Item
            </button>
          )}
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="mb-4">
            <AddItemForm onClose={() => setShowAddForm(false)} onAdded={handleAdded} />
          </div>
        )}

        {/* Loading */}
        {isLoading && <SkeletonList count={5} />}

        {/* Error */}
        {isError && (
          <div className="text-center py-12 text-muted-foreground">
            <p className="mb-2">Failed to load pantry.</p>
            <button
              onClick={() => refetch()}
              className="mt-1 px-3 py-2 text-sm text-primary border border-primary/30 rounded-md hover:bg-primary/10 transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && items.length === 0 && (
          <EmptyState
            icon={Package}
            title="Your pantry is empty"
            description="Add ingredients you have on hand to track them and see what's already covered on your grocery list."
            action={{ label: 'Add Item', onClick: () => setShowAddForm(true) }}
          />
        )}

        {/* Items list */}
        {!isLoading && !isError && items.length > 0 && (
          <div className="space-y-1">
            {items.map((item) => (
              <PantryRow
                key={item.id}
                item={item}
                onDelete={setItemToDelete}
                activeItemId={activeItemId}
                onSwipeStart={openSwipe}
                onSwipeEnd={closeSwipe}
              />
            ))}
            <p className="text-xs text-muted-foreground text-center pt-4 tabular-nums">
              {items.length} {items.length === 1 ? 'item' : 'items'} in pantry
            </p>
          </div>
        )}

        {/* Delete confirmation */}
        <ConfirmDialog
          open={itemToDelete !== null}
          title="Remove from pantry"
          description={
            itemToDelete ? `Remove "${itemToDelete.ingredientName}" from your pantry?` : ''
          }
          confirmText="Remove"
          variant="destructive"
          loading={deleteMutation.isPending}
          onConfirm={() => itemToDelete && deleteMutation.mutate(itemToDelete.id)}
          onCancel={() => setItemToDelete(null)}
        />
      </div>
    </PullToRefresh>
  );
}
