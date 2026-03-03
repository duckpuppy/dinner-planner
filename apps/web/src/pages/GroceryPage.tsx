import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  ShoppingCart,
  Check,
  Copy,
  Trash2,
  ChefHat,
  Package,
  Plus,
  X,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { menus, stores as storesApi, type GroceryItem, type CustomGroceryItem } from '@/lib/api';
import { useGroceryChecklist, groceryItemKey } from '@/hooks/useGroceryChecklist';
import { cn, localDateStr } from '@/lib/utils';
import { toast } from 'sonner';

function getTodayDateStr(): string {
  return localDateStr();
}

function scaleQuantity(quantity: number | null, scale: number): number | null {
  if (quantity === null) return null;
  const result = quantity * scale;
  // Avoid floating point noise: trim to 4 significant figures
  return Number(result.toPrecision(4));
}

function formatScaledQuantity(quantity: number | null, unit: string | null, name: string): string {
  const parts: string[] = [];
  if (quantity !== null) parts.push(String(quantity));
  if (unit) parts.push(unit);
  parts.push(name);
  return parts.join(' ');
}

function formatQuantity(item: GroceryItem, scale = 1): string {
  return formatScaledQuantity(scaleQuantity(item.quantity, scale), item.unit, item.name);
}

function buildPlainText(items: GroceryItem[], scale = 1): string {
  return items.map((item) => `- ${formatQuantity(item, scale)}`).join('\n');
}

const CATEGORY_ORDER = [
  'Produce',
  'Dairy',
  'Meat',
  'Seafood',
  'Bakery',
  'Frozen',
  'Pantry Staples',
  'Beverages',
  'Household',
  'Other',
] as const;

function sortByCategory(a: string, b: string): number {
  const ai = CATEGORY_ORDER.indexOf(a as (typeof CATEGORY_ORDER)[number]);
  const bi = CATEGORY_ORDER.indexOf(b as (typeof CATEGORY_ORDER)[number]);
  const aIdx = ai === -1 ? CATEGORY_ORDER.length : ai;
  const bIdx = bi === -1 ? CATEGORY_ORDER.length : bi;
  return aIdx - bIdx;
}

interface AddCustomItemFormProps {
  weekDate: string;
  onSuccess: () => void;
}

function AddCustomItemForm({ weekDate, onSuccess }: AddCustomItemFormProps) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');

  const { data: storesList } = useQuery({
    queryKey: ['stores'],
    queryFn: storesApi.list,
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: () =>
      menus.addCustomItem(weekDate, {
        name: name.trim(),
        ...(quantity !== '' ? { quantity: Number(quantity) } : {}),
        ...(unit.trim() !== '' ? { unit: unit.trim() } : {}),
        ...(selectedStoreId !== '' ? { storeId: selectedStoreId } : {}),
      }),
    onSuccess: () => {
      setName('');
      setQuantity('');
      setUnit('');
      setSelectedStoreId('');
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
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 pt-2">
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
        className="flex-1 min-w-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Item name"
      />
      {storesList && storesList.length > 0 && (
        <select
          value={selectedStoreId}
          onChange={(e) => setSelectedStoreId(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Store (optional)"
        >
          <option value="">No store</option>
          {storesList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
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
  checked: boolean;
  onToggle: () => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
  scale: number;
}

function CustomGroceryRow({
  item,
  checked,
  onToggle,
  onDelete,
  isDeleting,
  scale,
}: CustomGroceryRowProps) {
  const scaledQuantity = scaleQuantity(item.quantity, scale);
  return (
    <div
      className={cn('flex items-center gap-3 px-3 py-3 rounded-lg', isDeleting && 'opacity-50')}
      role="listitem"
    >
      {/* Checkbox toggle */}
      <button
        onClick={onToggle}
        className={cn(
          'flex-shrink-0 size-5 rounded border-2 flex items-center justify-center transition-colors',
          checked ? 'bg-primary border-primary' : 'border-muted-foreground/40 hover:border-primary'
        )}
        aria-label={`${checked ? 'Uncheck' : 'Check'} ${item.name}`}
      >
        {checked && <Check className="h-3 w-3 text-primary-foreground" />}
      </button>

      {/* Item details */}
      <span className={cn('flex-1 min-w-0', checked && 'opacity-50')}>
        <span className={cn('text-sm font-medium', checked && 'line-through')}>
          {scaledQuantity !== null && (
            <span className="text-muted-foreground mr-1 tabular-nums">
              {scaledQuantity}
              {item.unit && ` ${item.unit}`}
            </span>
          )}
          {item.unit && scaledQuantity === null && (
            <span className="text-muted-foreground mr-1">{item.unit}</span>
          )}
          {item.name}
        </span>
        {item.storeName && (
          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground">
            {item.storeName}
          </span>
        )}
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

interface CategorySectionProps {
  category: string;
  items: GroceryItem[];
  checkedSet: Set<string>;
  onToggle: (key: string, name: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isPantry?: boolean;
  scale: number;
}

function CategorySection({
  category,
  items,
  checkedSet,
  onToggle,
  collapsed,
  onToggleCollapse,
  isPantry = false,
  scale,
}: CategorySectionProps) {
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={onToggleCollapse}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-muted/50 rounded-md transition-colors"
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
        )}
        {isPantry && (
          <Package
            className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0"
            aria-hidden="true"
          />
        )}
        <span
          className={cn(
            'text-xs font-semibold uppercase tracking-wide',
            isPantry ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
          )}
        >
          {category}
        </span>
        <span className="ml-1 text-xs text-muted-foreground tabular-nums">({items.length})</span>
      </button>

      {!collapsed && (
        <div>
          {isPantry
            ? items.map((item) => (
                <PantryGroceryRow
                  key={groceryItemKey(item.name, item.unit)}
                  item={item}
                  scale={scale}
                />
              ))
            : items.map((item) => {
                const key = groceryItemKey(item.name, item.unit);
                return (
                  <GroceryRow
                    key={key}
                    item={item}
                    checked={checkedSet.has(key)}
                    onToggle={() => onToggle(key, item.name)}
                    scale={scale}
                  />
                );
              })}
        </div>
      )}
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
    refetchInterval: 5000,
  });

  const weekStartDate = data?.weekStartDate ?? '';
  const checkedKeys = data?.checkedKeys ?? [];

  const { checked, toggle, clearAll } = useGroceryChecklist({
    checkedKeys,
    weekStartDate,
    requestedDate,
  });

  const allItems = data?.groceries ?? [];
  const customItems = data?.customItems ?? [];

  const [scale, setScale] = useState<1 | 2 | 4>(1);
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  function toggleCategory(category: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  // Derive all unique store names from recipe items
  const allStoreNames = Array.from(new Set(allItems.flatMap((item) => item.stores ?? []))).sort();
  const showStoreFilter = allStoreNames.length > 1;

  // Filter recipe items by selected store
  const filteredItems = selectedStore
    ? allItems.filter((item) => (item.stores ?? []).includes(selectedStore))
    : allItems;

  // Split into pantry vs shopping
  const pantryItems = filteredItems.filter((i) => i.inPantry);
  const shoppingItems = filteredItems.filter((i) => !i.inPantry);

  // Group shopping items by category
  const categoryMap = new Map<string, GroceryItem[]>();
  for (const item of shoppingItems) {
    const cat = item.category || 'Other';
    const group = categoryMap.get(cat) ?? [];
    group.push(item);
    categoryMap.set(cat, group);
  }
  const sortedCategories = Array.from(categoryMap.keys()).sort(sortByCategory);

  // Group pantry items by category
  const pantryCategoryMap = new Map<string, GroceryItem[]>();
  for (const item of pantryItems) {
    const cat = item.category || 'Other';
    const group = pantryCategoryMap.get(cat) ?? [];
    group.push(item);
    pantryCategoryMap.set(cat, group);
  }
  const sortedPantryCategories = Array.from(pantryCategoryMap.keys()).sort(sortByCategory);

  // For progress bar: count checked shopping items (not pantry, not custom)
  const checkedShoppingCount = shoppingItems.filter((i) =>
    checked.has(groceryItemKey(i.name, i.unit))
  ).length;
  const checkedCustomCount = customItems.filter((i) => checked.has(`custom::${i.id}`)).length;

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
    const text = buildPlainText(shoppingItems, scale);
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }

  const hasAnyItems = allItems.length > 0 || customItems.length > 0;
  const effectiveWeekDate = weekStartDate || requestedDate;
  const totalShoppable = shoppingItems.length + customItems.length;
  const totalChecked = checkedShoppingCount + checkedCustomCount;

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
              {totalChecked > 0 && (
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

      {/* Store filter + scale selector toolbar */}
      {!isLoading && !isError && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {showStoreFilter && (
            <div className="flex-1 min-w-[160px]">
              <label htmlFor="store-filter" className="sr-only">
                Filter by store
              </label>
              <select
                id="store-filter"
                value={selectedStore}
                onChange={(e) => setSelectedStore(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All Stores</option>
                {allStoreNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-1.5 shrink-0" role="group" aria-label="Serving scale">
            <span className="text-xs text-muted-foreground font-medium">Scale:</span>
            {([1, 2, 4] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScale(s)}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-md border transition-colors',
                  scale === s
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-input hover:bg-muted text-muted-foreground'
                )}
                aria-pressed={scale === s}
              >
                {s}&times;
              </button>
            ))}
          </div>
        </div>
      )}

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
        <div className="space-y-0.5">
          {/* Category-grouped shopping items */}
          {sortedCategories.map((category) => {
            const items = categoryMap.get(category) ?? [];
            return (
              <CategorySection
                key={category}
                category={category}
                items={items}
                checkedSet={checked}
                onToggle={toggle}
                collapsed={collapsedCategories.has(category)}
                onToggleCollapse={() => toggleCategory(category)}
                scale={scale}
              />
            );
          })}

          {/* Pantry sections */}
          {sortedPantryCategories.length > 0 && (
            <>
              {sortedCategories.length > 0 && <div className="border-t my-3" />}
              {sortedPantryCategories.map((category) => {
                const items = pantryCategoryMap.get(category) ?? [];
                const key = `pantry-${category}`;
                return (
                  <CategorySection
                    key={key}
                    category={`${category} — In Pantry`}
                    items={items}
                    checkedSet={checked}
                    onToggle={toggle}
                    collapsed={collapsedCategories.has(key)}
                    onToggleCollapse={() => toggleCategory(key)}
                    isPantry
                    scale={scale}
                  />
                );
              })}
            </>
          )}

          {/* Custom items section — always visible after data loads */}
          <>
            {(allItems.length > 0 || customItems.length > 0) && <div className="border-t my-3" />}
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
                  checked={checked.has(`custom::${item.id}`)}
                  onToggle={() => toggle(`custom::${item.id}`, item.name)}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  isDeleting={deleteMutation.isPending && deleteMutation.variables === item.id}
                  scale={scale}
                />
              ))}
            </div>
            <div className="px-1">
              <AddCustomItemForm weekDate={effectiveWeekDate} onSuccess={handleAddSuccess} />
            </div>
          </>

          {/* Progress summary */}
          {totalShoppable > 0 && (
            <p className="text-xs text-muted-foreground text-center pt-4 tabular-nums">
              {checkedShoppingCount} of {shoppingItems.length} items checked
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
  scale: number;
}

interface PantryGroceryRowProps {
  item: GroceryItem;
  scale: number;
}

function PantryGroceryRow({ item, scale }: PantryGroceryRowProps) {
  const scaledQuantity = scaleQuantity(item.quantity, scale);
  return (
    <div
      role="listitem"
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
          {scaledQuantity !== null && (
            <span className="text-muted-foreground mr-1 tabular-nums">
              {scaledQuantity}
              {item.unit && ` ${item.unit}`}
            </span>
          )}
          {item.unit && scaledQuantity === null && (
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

function GroceryRow({ item, checked, onToggle, scale }: GroceryRowProps) {
  const scaledQuantity = scaleQuantity(item.quantity, scale);
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
          {scaledQuantity !== null && (
            <span className="text-muted-foreground mr-1 tabular-nums">
              {scaledQuantity}
              {item.unit && ` ${item.unit}`}
            </span>
          )}
          {item.unit && scaledQuantity === null && (
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
