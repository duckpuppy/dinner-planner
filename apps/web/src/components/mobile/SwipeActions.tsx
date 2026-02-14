import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SwipeAction {
  label: string;
  icon: LucideIcon;
  color: 'destructive' | 'primary' | 'secondary';
  onAction: () => void | Promise<void>;
}

interface SwipeActionsProps {
  actions: SwipeAction[];
  visible: boolean;
}

const colorClasses = {
  destructive: 'bg-red-600 hover:bg-red-700 text-white',
  primary: 'bg-blue-600 hover:bg-blue-700 text-white',
  secondary: 'bg-gray-600 hover:bg-gray-700 text-white',
};

export function SwipeActions({ actions, visible }: SwipeActionsProps) {
  return (
    <div
      className={cn(
        'absolute right-0 top-0 bottom-0 flex items-stretch transition-transform duration-200',
        !visible && 'translate-x-full'
      )}
    >
      {actions.map((action, index) => {
        const Icon = action.icon;
        return (
          <button
            key={index}
            onClick={(e) => {
              e.stopPropagation();
              action.onAction();
            }}
            className={cn(
              'flex flex-col items-center justify-center gap-1 px-4 min-w-[80px] touch-action-manipulation',
              colorClasses[action.color]
            )}
            aria-label={action.label}
          >
            <Icon className="h-5 w-5" />
            <span className="text-xs font-medium">{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}
