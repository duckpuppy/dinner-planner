import { cn } from '@/lib/utils';

export interface CheckedByUser {
  id: string;
  displayName: string;
}

// Literal class strings so Tailwind keeps them. All pair white text with a -700 shade (AA).
const CHIP_COLORS = [
  'bg-sky-700',
  'bg-emerald-700',
  'bg-amber-700',
  'bg-rose-700',
  'bg-teal-700',
  'bg-indigo-700',
] as const;

/** Stable colour per user id (same user, same colour, on every device). */
export function chipColorClass(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return CHIP_COLORS[h % CHIP_COLORS.length];
}

export function initialsOf(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = Array.from(words[0])[0] ?? '';
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Accessible description of who checked an item, for aria-labels. */
export function checkedByLabel(user: CheckedByUser | null | undefined): string {
  return user ? `, checked by ${user.displayName}` : '';
}

/** Compact initials badge showing who checked an item. */
export function CheckedByChip({ user, className }: { user: CheckedByUser; className?: string }) {
  return (
    <span
      role="img"
      title={user.displayName}
      aria-label={`Checked by ${user.displayName}`}
      className={cn(
        'inline-flex size-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold leading-none text-white',
        chipColorClass(user.id),
        className
      )}
    >
      <span aria-hidden="true">{initialsOf(user.displayName)}</span>
    </span>
  );
}
