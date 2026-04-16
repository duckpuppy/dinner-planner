import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DishPickerModal } from '@/components/DishPickerModal';

export interface DishPickerDish {
  id: string;
  name: string;
  type: string;
  tags: string[];
  dietaryTags: string[];
}

export interface DishPickerProps {
  mode: 'single' | 'multi';
  dishType: 'main' | 'side';
  dishes: DishPickerDish[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  placeholder?: string;
  label: string;
  trailingAction?: React.ReactNode;
}

export function DishPicker({
  mode,
  dishes,
  value,
  onChange,
  placeholder = 'Select...',
  label,
  trailingAction,
}: DishPickerProps) {
  const [open, setOpen] = useState(false);

  if (mode === 'single') {
    const selectedId = value as string;
    const selectedDish = dishes.find((d) => d.id === selectedId);

    const selected = new Set(selectedId ? [selectedId] : []);

    const handleToggle = (id: string) => {
      onChange(id);
    };

    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex-1 flex items-center justify-between px-3 py-2 border rounded-md bg-background text-sm hover:bg-muted/50 transition-colors"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={label}
        >
          <span className={cn(!selectedDish && 'text-muted-foreground')}>
            {selectedDish ? selectedDish.name : placeholder}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-2" aria-hidden="true" />
        </button>
        {trailingAction}
        <DishPickerModal
          open={open}
          mode="single"
          dishes={dishes}
          selected={selected}
          onToggle={handleToggle}
          onClose={() => setOpen(false)}
          title={label}
        />
      </div>
    );
  }

  // Multi-select mode
  const selectedIds = value as string[];
  const selectedSet = new Set(selectedIds);
  const selectedDishes = dishes.filter((d) => selectedSet.has(d.id));

  const handleToggle = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const handleRemove = (id: string) => {
    onChange(selectedIds.filter((sid) => sid !== id));
  };

  return (
    <div className="space-y-2">
      {selectedDishes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedDishes.map((dish) => (
            <span
              key={dish.id}
              className="inline-flex items-center gap-1 py-1 pl-3 pr-1 rounded-full text-sm border bg-primary/10 text-foreground"
            >
              {dish.name}
              <button
                type="button"
                onClick={() => handleRemove(dish.id)}
                className="p-0.5 rounded-full hover:bg-muted-foreground/20"
                aria-label={`Remove ${dish.name}`}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-3 py-1.5 border rounded-md bg-background text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
      >
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
        {placeholder}
      </button>
      {trailingAction}
      <DishPickerModal
        open={open}
        mode="multi"
        dishes={dishes}
        selected={selectedSet}
        onToggle={handleToggle}
        onClose={() => setOpen(false)}
        title={label}
      />
    </div>
  );
}
