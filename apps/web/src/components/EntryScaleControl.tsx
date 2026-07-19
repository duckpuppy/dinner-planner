import { cn } from '@/lib/utils';

const SCALE_OPTIONS = [1, 2, 4] as const;

export interface EntryScaleControlProps {
  /** Accessible label for the button group, e.g. "Main dish serving scale" */
  label: string;
  value: number;
  onChange: (scale: 1 | 2 | 4) => void;
  disabled?: boolean;
  /** Use smaller padding to match compact list rows (e.g. WeekPage). */
  compact?: boolean;
}

export function EntryScaleControl({
  label,
  value,
  onChange,
  disabled,
  compact,
}: EntryScaleControlProps) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      {SCALE_OPTIONS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          disabled={disabled}
          className={cn(
            'text-xs font-medium rounded border transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
            compact ? 'px-1.5 py-0.5' : 'px-2 py-1',
            value === s
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-input hover:bg-muted text-muted-foreground'
          )}
          aria-pressed={value === s}
        >
          {s}&times;
        </button>
      ))}
    </div>
  );
}

export interface ScaleBadgeProps {
  scale: number;
  label: string;
  /** Use the larger text size to match TodayPage's detail view. */
  large?: boolean;
  className?: string;
}

/** Small badge showing a non-default (>1x) serving scale next to a dish name. */
export function ScaleBadge({ scale, label, large, className }: ScaleBadgeProps) {
  if (scale === 1) return null;
  return (
    <span
      className={cn(
        'shrink-0 font-semibold text-primary tabular-nums',
        large ? 'text-sm' : 'text-xs',
        className
      )}
      aria-label={`${label}: ${scale}×`}
    >
      {scale}&times;
    </span>
  );
}
