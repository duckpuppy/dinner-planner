import { Star } from 'lucide-react';

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: 'sm' | 'md' | 'lg';
  readonly?: boolean;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

export function StarRating({ value, onChange, size = 'md', readonly = false }: StarRatingProps) {
  const handleClick = (star: number) => {
    if (!readonly && onChange) {
      onChange(star);
    }
  };

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => handleClick(star)}
          disabled={readonly}
          className={`${readonly ? 'cursor-default p-0' : 'cursor-pointer hover:scale-110 p-2 -m-2'} transition-transform touch-manipulation`}
          style={{ touchAction: 'manipulation' }}
        >
          <Star
            className={`${sizeClasses[size]} ${
              star <= value ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'
            }`}
          />
        </button>
      ))}
    </div>
  );
}

interface AverageRatingProps {
  average: number | null;
  count: number;
  size?: 'sm' | 'md' | 'lg';
}

export function AverageRating({ average, count, size = 'sm' }: AverageRatingProps) {
  if (average === null || count === 0) {
    return <span className="text-gray-400 text-sm">No ratings</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <StarRating value={Math.round(average)} size={size} readonly />
      <span className="text-sm text-gray-600">
        {average.toFixed(1)} ({count})
      </span>
    </div>
  );
}
