import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ShoppingCart, Check, Copy, Trash2, ChefHat, Package, Plus, X } from 'lucide-react';
import { menus, type GroceryItem, type CustomGroceryItem } from '@/lib/api';
import { useGroceryChecklist, groceryItemKey } from '@/hooks/useGroceryChecklist';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function getTodayDateStr(): string {
  return new Date().toISOString().split('T')[0];
}

function formatQuantity(item: GroceryItem): string {
  const parts: string[] = [];
  if (item.quantity !== null) parts.push(String(item.quantity));
  if (item.unit) parts.push(item.unit);
  parts.push(item.name);
  return parts.join(' ');
}

function buildPlainText(items: GroceryItem[]): string {
  return items.map((item) => `- ${formatQuantity(item)}`).join('\n');
}

interface AddCustomItemFormProps {
  weekDate: string;
  onSuccess: () => void;
}

function AddCustomItemForm({ weekDate, onSuccess }: AddCustomItemFormProps) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      menus.addCustomItem(weekDate, {
        name: name.trim(),
        ...(quantity !== '' ? { quantity: Number(quantity) } : {}),
        ...(unit.trim() !== '' ? { unit: unit.trim() } : {}),
      }),
    onSuccess: () => {
      setName('');
      setQuantity('');
      setUnit('');
      onSuccess();
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      handleSubmit(e as unknown as React.FormEvent);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-2">
      <input
        type="number"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        placeholder="Qty"
        min={0}
        className="w-16 rounded-md border border-input bg-background px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring tabular-nums"
        aria-label="Quantity (optional)"
      />
      <input
        type="text"
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        placeholder="Unit"
        className="w-16 rounded-md border border-input bg-background px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Unit (optional)"
      />
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Item name"
        required
        className="flex-1 min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Item name"
      />
      <button
        type="submit"
        disabled={!name.trim() || mutation.isPending}
        className="flex items-center gap-1 px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label="Add item"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        Add
      </button>
    </form>
  );
}

interface CustomGroceryRowProps {
  item: CustomGroceryItem;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

function CustomGroceryRow({ item, onDelete, isDeleting }: CustomGroceryRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-3 rounded-lg',
        isDeleting && 'opacity-50'
      )}
      role="listitem"
    >
      {/* Custom item indicator */}
      <span
        className="flex-shrink-0 size-5 rounded border-2 flex items-center justify-center border-muted-foreground/40"
        aria-hidden="true"
      >
        <Plus className="h-3 w-3 text-muted-foreground" />
      </span>

      {/* Item details */}
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
      </span>

      <button
        onClick={() => onDelete(item.id)}
        disabled={isDeleting}
        className="flex-shrink-0 p-2.5 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
        aria-label={`Delete ${item.name}`}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function GroceryPage() {
  const [searchParams] = useSearchParams();
  const requestedDate = searchParams.get('date') ?? getTodayDateStr();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['groceries', requestedDate],
    queryFn: () => menus.getGroceries(requestedDate),
  });

  const weekStartDate = data?.weekStartDate ?? '';
  const { checked, toggle, clearAll } = useGroceryChecklist(weekStartDate);

  const allItems = data?.groceries ?? [];
  const customItems = data?.customItems ?? [];

  // inPantry items go to their own section regardless of checked state
  const pantryItems = allItems.filter((i) => i.inPantry);
  const shoppingItems = allItems.filter((i) => !i.inPantry);
  const unchecked = shoppingItems.filter((i) => !checked.has(groceryItemKey(i.name, i.unit)));
  const checkedItems = shoppingItems.filter((i) => checked.has(groceryItemKey(i.name, i.unit)));

  const deleteMutation = useMutation({
    mutationFn: (id: string) => menus.deleteCustomItem(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groceries', requestedDate] });
    },
    onError: () => {
      toast.error('Failed to delete item');
    },
  });

  function handleAddSuccess() {
    void queryClient.invalidateQueries({ queryKey: ['groceries', requestedDate] });
  }

  async function handleCopy() {
    const text = buildPlainText(unchecked.concat(checkedItems));
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }

  const hasAnyItems = allItems.length > 0 || customItems.length > 0;
  // Effective week date for new custom items — use resolved weekStartDate when available,
  // fall back to requestedDate so the form is available even before data loads
  const effectiveWeekDate = weekStartDate || requestedDate;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-balance">Grocery List</h1>
        </div>
        <div className="flex items-center gap-2">
          {hasAnyItems && (
            <>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-muted transition-colors"
                title="Copy list to clipboard"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                Copy
              </button>
              {checked.size > 0 && (
                <button
                  onClick={clearAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-muted transition-colors text-muted-foreground"
                  title="Uncheck all items"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Clear
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="mb-2">Failed to load grocery list.</p>
          <button
            onClick={() => refetch()}
            className="mt-1 px-3 py-2 text-sm text-primary border border-primary/30 rounded-md hover:bg-primary/10 transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {!isLoading && !isError && allItems.length === 0 && customItems.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          <ChefHat className="h-12 w-12 mx-auto mb-3 opacity-30" aria-hidden="true" />
          <p className="font-medium">No ingredients this week</p>
          <p className="text-sm mt-1 text-pretty">
            Add dishes with ingredients to this week's menu to generate a grocery list.
          </p>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="space-y-1">
          {/* Unchecked items */}
          {unchecked.map((item) => (
            <GroceryRow
              key={groceryItemKey(item.name, item.unit)}
              item={item}
              checked={false}
              onToggle={() => toggle(groceryItemKey(item.name, item.unit))}
            />
          ))}

          {/* Divider between unchecked and checked */}
          {checkedItems.length > 0 && unchecked.length > 0 && <div className="border-t my-3" />}

          {/* Checked items (strikethrough, dimmed) */}
          {checkedItems.map((item) => (
            <GroceryRow
              key={groceryItemKey(item.name, item.unit)}
              item={item}
              checked={true}
              onToggle={() => toggle(groceryItemKey(item.name, item.unit))}
            />
          ))}

          {/* In pantry section */}
          {pantryItems.length > 0 && (
            <>
              <div className="border-t my-3" />
              <div className="flex items-center gap-1.5 px-3 py-1">
                <Package
                  className="h-3.5 w-3.5 text-green-600 dark:text-green-400"
                  aria-hidden="true"
                />
                <span className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide">
                  In Pantry
                </span>
              </div>
              {pantryItems.map((item) => (
                <PantryGroceryRow key={groceryItemKey(item.name, item.unit)} item={item} />
              ))}
            </>
          )}

          {/* Custom items section — always visible after data loads */}
          <>
            {(allItems.length > 0 || customItems.length > 0) && (
              <div className="border-t my-3" />
            )}
            <div className="flex items-center gap-1.5 px-3 py-1">
              <Plus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Custom Items
              </span>
            </div>
            <div role="list">
            {customItems.map((item) => (
              <CustomGroceryRow
                key={item.id}
                item={item}
                onDelete={(id) => deleteMutation.mutate(id)}
                isDeleting={deleteMutation.isPending && deleteMutation.variables === item.id}
              />
            ))}
            </div>
            <div className="px-1">
              <AddCustomItemForm weekDate={effectiveWeekDate} onSuccess={handleAddSuccess} />
            </div>
          </>

          {/* Progress summary — only counts shopping items */}
          {shoppingItems.length > 0 && (
            <p className="text-xs text-muted-foreground text-center pt-4 tabular-nums">
              {checked.size} of {shoppingItems.length} items checked
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface GroceryRowProps {
  item: GroceryItem;
  checked: boolean;
  onToggle: () => void;
}

interface PantryGroceryRowProps {
  item: GroceryItem;
}

function PantryGroceryRow({ item }: PantryGroceryRowProps) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-3 rounded-lg opacity-60"
      aria-label={`${item.name} — already in pantry`}
    >
      {/* Green check indicator */}
      <span
        className="flex-shrink-0 size-5 rounded border-2 flex items-center justify-center bg-green-600 border-green-600"
        aria-hidden="true"
      >
        <Check className="h-3 w-3 text-white" />
      </span>

      {/* Item details */}
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
        {(item.dishes.length > 0 || item.notes.length > 0) && (
          <span className="block text-xs text-muted-foreground mt-0.5 truncate">
            {item.notes.length > 0 && `${item.notes.join(', ')} · `}
            {item.dishes.join(', ')}
          </span>
        )}
      </span>

      <span className="flex-shrink-0 text-xs text-green-600 dark:text-green-400 font-medium">
        In Pantry
      </span>
    </div>
  );
}

function GroceryRow({ item, checked, onToggle }: GroceryRowProps) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors hover:bg-muted/50',
        checked && 'opacity-50'
      )}
      aria-label={`${checked ? 'Uncheck' : 'Check'} ${item.name}`}
    >
      {/* Checkbox */}
      <span
        className={cn(
          'flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
          checked ? 'bg-primary border-primary' : 'border-muted-foreground/40 hover:border-primary'
        )}
      >
        {checked && <Check className="h-3 w-3 text-primary-foreground" />}
      </span>

      {/* Item details */}
      <span className="flex-1 min-w-0">
        <span className={cn('text-sm font-medium', checked && 'line-through')}>
          {item.quantity !== null && (
            <span className="text-muted-foreground mr-1">
              {item.quantity}
              {item.unit && ` ${item.unit}`}
            </span>
          )}
          {item.unit && item.quantity === null && (
            <span className="text-muted-foreground mr-1">{item.unit}</span>
          )}
          {item.name}
        </span>
        {(item.dishes.length > 0 || item.notes.length > 0) && (
          <span className="block text-xs text-muted-foreground mt-0.5 truncate">
            {item.notes.length > 0 && `${item.notes.join(', ')} · `}
            {item.dishes.join(', ')}
          </span>
        )}
      </span>
    </button>
  );
}
