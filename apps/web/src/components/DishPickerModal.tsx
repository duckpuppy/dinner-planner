import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Check, Square, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DishPickerModalDish {
  id: string;
  name: string;
  tags: string[];
  dietaryTags: string[];
}

export interface DishPickerModalProps {
  open: boolean;
  mode: 'single' | 'multi';
  dishes: DishPickerModalDish[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onClose: () => void;
  title: string;
}

export function DishPickerModal({
  open,
  mode,
  dishes,
  selected,
  onToggle,
  onClose,
  title,
}: DishPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open, onClose]);

  // Reset search and autofocus when opening
  useEffect(() => {
    if (open) {
      setSearchQuery('');
      const t = setTimeout(() => searchRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!open) return null;

  const filtered = dishes.filter((d) => d.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const selectedCount = selected.size;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border rounded-t-2xl sm:rounded-xl shadow-lg w-full sm:max-w-md mx-0 sm:mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 p-4 border-b shrink-0">
          <h2 className="text-base font-semibold flex-1">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dishes..."
              className="w-full pl-9 pr-3 py-2 text-sm border rounded-md bg-background"
              aria-label="Search dishes"
            />
          </div>
        </div>

        {/* Dish list */}
        <div
          className="overflow-y-auto flex-1"
          role="listbox"
          aria-label={title}
          aria-multiselectable={mode === 'multi'}
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
              <Search className="h-8 w-8 mb-2 opacity-40" aria-hidden="true" />
              <p>No dishes found</p>
            </div>
          ) : (
            filtered.map((dish) => {
              const isSelected = selected.has(dish.id);
              return (
                <button
                  key={dish.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onToggle(dish.id);
                    if (mode === 'single') onClose();
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted transition-colors min-h-[48px]',
                    isSelected && 'bg-primary/5'
                  )}
                >
                  <span className="shrink-0" aria-hidden="true">
                    {mode === 'multi' ? (
                      isSelected ? (
                        <Check className="h-4 w-4 text-primary" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground" />
                      )
                    ) : isSelected ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : (
                      <span className="inline-block h-4 w-4" />
                    )}
                  </span>
                  <span className="flex-1 truncate">{dish.name}</span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer — multi-select only */}
        {mode === 'multi' && (
          <div className="p-4 border-t shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 text-sm"
            >
              {selectedCount > 0 ? `Done (${selectedCount} selected)` : 'Done'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
