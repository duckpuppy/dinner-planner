import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, Check, Copy, Trash2, ChefHat } from 'lucide-react';
import { menus, type GroceryItem } from '@/lib/api';
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

export function GroceryPage() {
  const today = getTodayDateStr();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['groceries', today],
    queryFn: () => menus.getGroceries(today),
  });

  const weekStartDate = data?.weekStartDate ?? '';
  const { checked, toggle, clearAll } = useGroceryChecklist(weekStartDate);

  const allItems = data?.groceries ?? [];
  const unchecked = allItems.filter((i) => !checked.has(groceryItemKey(i.name, i.unit)));
  const checkedItems = allItems.filter((i) => checked.has(groceryItemKey(i.name, i.unit)));

  async function handleCopy() {
    const text = buildPlainText(unchecked.concat(checkedItems));
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Grocery List</h1>
        </div>
        <div className="flex items-center gap-2">
          {allItems.length > 0 && (
            <>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-muted transition-colors"
                title="Copy list to clipboard"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
              {checked.size > 0 && (
                <button
                  onClick={clearAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-muted transition-colors text-muted-foreground"
                  title="Uncheck all items"
                >
                  <Trash2 className="h-3.5 w-3.5" />
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
          <button onClick={() => refetch()} className="text-primary text-sm underline">
            Try again
          </button>
        </div>
      )}

      {!isLoading && !isError && allItems.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <ChefHat className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No ingredients this week</p>
          <p className="text-sm mt-1">
            Add dishes with ingredients to this week's menu to generate a grocery list.
          </p>
        </div>
      )}

      {!isLoading && !isError && allItems.length > 0 && (
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

          {/* Progress summary */}
          {allItems.length > 0 && (
            <p className="text-xs text-muted-foreground text-center pt-4">
              {checked.size} of {allItems.length} items checked
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
