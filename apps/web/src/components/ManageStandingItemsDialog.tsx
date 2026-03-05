import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, RefreshCw } from 'lucide-react';
import { standing as standingApi, type StandingItem, type Store } from '@/lib/api';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const CATEGORY_OPTIONS = [
  'Produce',
  'Dairy',
  'Meat',
  'Seafood',
  'Bakery',
  'Frozen',
  'Beverages',
  'Household',
  'Pantry Staples',
  'Other',
] as const;

interface ManageStandingItemsDialogProps {
  standingItems: StandingItem[];
  stores: Store[];
  onClose: () => void;
}

export function ManageStandingItemsDialog({
  standingItems,
  stores,
  onClose,
}: ManageStandingItemsDialogProps) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [category, setCategory] = useState<string>('Other');
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && deleteTargetId === null) onClose();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onClose, deleteTargetId]);

  const addMutation = useMutation({
    mutationFn: () =>
      standingApi.add({
        name: name.trim(),
        ...(quantity !== '' ? { quantity: Number(quantity) } : { quantity: null }),
        ...(unit.trim() !== '' ? { unit: unit.trim() } : { unit: null }),
        category,
        ...(selectedStoreId !== '' ? { storeId: selectedStoreId } : { storeId: null }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groceries'] });
      setName('');
      setQuantity('');
      setUnit('');
      setCategory('Other');
      setSelectedStoreId('');
    },
    onError: () => {
      toast.error('Failed to add standing item');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => standingApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groceries'] });
      setDeleteTargetId(null);
    },
    onError: () => {
      toast.error('Failed to delete standing item');
      setDeleteTargetId(null);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    addMutation.mutate();
  }

  const deleteTarget = deleteTargetId ? standingItems.find((i) => i.id === deleteTargetId) : null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
        <div
          className="relative bg-card border rounded-t-2xl sm:rounded-xl shadow-lg w-full sm:max-w-md mx-0 sm:mx-4 max-h-[85dvh] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Manage recurring items"
        >
          {/* Header */}
          <div className="flex items-center gap-2 p-4 border-b shrink-0">
            <RefreshCw className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-base font-semibold flex-1 text-balance">Recurring Items</h2>
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-muted"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Existing items list */}
          <div className="overflow-y-auto flex-1 px-4 py-3">
            {standingItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 text-pretty">
                No recurring items yet. Add one below.
              </p>
            ) : (
              <ul role="list" className="space-y-1">
                {standingItems.map((item) => (
                  <li
                    key={item.id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg',
                      deleteMutation.isPending &&
                        deleteMutation.variables === item.id &&
                        'opacity-50'
                    )}
                    role="listitem"
                  >
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-medium">
                        {item.quantity !== null && (
                          <span className="text-muted-foreground mr-1 tabular-nums">
                            {item.quantity}
                            {item.unit && ` ${item.unit}`}
                          </span>
                        )}
                        {item.unit && item.quantity === null && (
                          <span className="text-muted-foreground mr-1">{item.unit}</span>
                        )}
                        {item.name}
                      </span>
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground">
                        {item.category}
                      </span>
                      {item.storeName && (
                        <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground">
                          {item.storeName}
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => setDeleteTargetId(item.id)}
                      disabled={deleteMutation.isPending && deleteMutation.variables === item.id}
                      className="flex-shrink-0 p-2 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                      aria-label={`Delete ${item.name}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Add form */}
          <div className="border-t p-4 shrink-0">
            <p className="text-sm font-medium mb-3">Add recurring item</p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label
                  htmlFor="standing-item-name"
                  className="block text-xs text-muted-foreground mb-1"
                >
                  Item name <span className="text-destructive">*</span>
                </label>
                <input
                  id="standing-item-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Eggs"
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label
                    htmlFor="standing-item-qty"
                    className="block text-xs text-muted-foreground mb-1"
                  >
                    Quantity
                  </label>
                  <input
                    id="standing-item-qty"
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="e.g. 12"
                    min={0}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring tabular-nums"
                  />
                </div>
                <div className="flex-1">
                  <label
                    htmlFor="standing-item-unit"
                    className="block text-xs text-muted-foreground mb-1"
                  >
                    Unit
                  </label>
                  <input
                    id="standing-item-unit"
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="e.g. L"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="standing-item-category"
                  className="block text-xs text-muted-foreground mb-1"
                >
                  Category
                </label>
                <select
                  id="standing-item-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {stores.length > 0 && (
                <div>
                  <label
                    htmlFor="standing-item-store"
                    className="block text-xs text-muted-foreground mb-1"
                  >
                    Store
                  </label>
                  <select
                    id="standing-item-store"
                    value={selectedStoreId}
                    onChange={(e) => setSelectedStoreId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">No store</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm border rounded-md hover:bg-muted"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={!name.trim() || addMutation.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  {addMutation.isPending ? 'Adding...' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteTargetId !== null}
        title="Delete recurring item"
        description={
          deleteTarget
            ? `Remove "${deleteTarget.name}" from recurring items? It will no longer appear on the grocery list every week.`
            : 'Remove this item from recurring items?'
        }
        confirmText="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTargetId) deleteMutation.mutate(deleteTargetId);
        }}
        onCancel={() => setDeleteTargetId(null)}
      />
    </>,
    document.body
  );
}
