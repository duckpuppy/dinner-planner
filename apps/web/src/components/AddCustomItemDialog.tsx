import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus } from 'lucide-react';
import { menus, type Store } from '@/lib/api';
import { toast } from 'sonner';

interface AddCustomItemDialogProps {
  weekDate: string;
  stores: Store[];
  onClose: () => void;
}

export function AddCustomItemDialog({ weekDate, stores, onClose }: AddCustomItemDialogProps) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');

  const queryClient = useQueryClient();

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onClose]);

  const mutation = useMutation({
    mutationFn: () =>
      menus.addCustomItem(weekDate, {
        name: name.trim(),
        ...(quantity !== '' ? { quantity: Number(quantity) } : {}),
        ...(unit.trim() !== '' ? { unit: unit.trim() } : {}),
        ...(selectedStoreId !== '' ? { storeId: selectedStoreId } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groceries'] });
      setName('');
      setQuantity('');
      setUnit('');
      setSelectedStoreId('');
      onClose();
    },
    onError: () => {
      toast.error('Failed to add item');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    mutation.mutate();
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        className="relative bg-card border rounded-t-2xl sm:rounded-xl shadow-lg w-full sm:max-w-md mx-0 sm:mx-4 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Add custom item"
      >
        {/* Header */}
        <div className="flex items-center gap-2 p-4 border-b shrink-0">
          <Plus className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-base font-semibold flex-1 text-balance">Add Item</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label htmlFor="custom-item-name" className="block text-sm font-medium mb-1.5">
              Item name <span className="text-destructive">*</span>
            </label>
            <input
              id="custom-item-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Paper towels"
              required
              autoFocus
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label htmlFor="custom-item-qty" className="block text-sm font-medium mb-1.5">
                Quantity
              </label>
              <input
                id="custom-item-qty"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 2"
                min={0}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring tabular-nums"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="custom-item-unit" className="block text-sm font-medium mb-1.5">
                Unit
              </label>
              <input
                id="custom-item-unit"
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g. L, kg"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {stores.length > 0 && (
            <div>
              <label htmlFor="custom-item-store" className="block text-sm font-medium mb-1.5">
                Store
              </label>
              <select
                id="custom-item-store"
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
              disabled={!name.trim() || mutation.isPending}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {mutation.isPending ? 'Adding...' : 'Add item'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
