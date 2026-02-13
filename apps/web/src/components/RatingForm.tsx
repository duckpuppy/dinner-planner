import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ratings, Rating } from '../lib/api';
import { StarRating } from './StarRating';
import { Trash2, Edit2, Check, X } from 'lucide-react';

interface RatingFormProps {
  preparationId: string;
  existingRating?: Rating;
  currentUserId: string;
  onRatingCreated?: () => void;
}

export function RatingForm({ preparationId, existingRating, currentUserId, onRatingCreated }: RatingFormProps) {
  const [stars, setStars] = useState(existingRating?.stars ?? 0);
  const [note, setNote] = useState(existingRating?.note ?? '');
  const [isEditing, setIsEditing] = useState(!existingRating);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () => ratings.create(preparationId, { stars, note: note || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preparations'] });
      queryClient.invalidateQueries({ queryKey: ['ratings', preparationId] });
      queryClient.invalidateQueries({ queryKey: ['menus'] });
      onRatingCreated?.();
      setIsEditing(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => ratings.update(existingRating!.id, { stars, note: note || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preparations'] });
      queryClient.invalidateQueries({ queryKey: ['ratings', preparationId] });
      queryClient.invalidateQueries({ queryKey: ['menus'] });
      setIsEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => ratings.delete(existingRating!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preparations'] });
      queryClient.invalidateQueries({ queryKey: ['ratings', preparationId] });
      queryClient.invalidateQueries({ queryKey: ['menus'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (stars === 0) return;

    if (existingRating) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const handleCancel = () => {
    if (existingRating) {
      setStars(existingRating.stars);
      setNote(existingRating.note ?? '');
      setIsEditing(false);
    }
  };

  const isOwner = existingRating?.userId === currentUserId;
  const isLoading = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  // Display mode for non-owner's rating
  if (existingRating && !isOwner) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <StarRating value={existingRating.stars} size="sm" readonly />
        <span className="text-gray-600">{existingRating.userName}</span>
        {existingRating.note && (
          <span className="text-gray-500">- {existingRating.note}</span>
        )}
      </div>
    );
  }

  // Display mode for owner's rating (not editing)
  if (existingRating && !isEditing) {
    return (
      <div className="flex items-center gap-2">
        <StarRating value={existingRating.stars} size="sm" readonly />
        {existingRating.note && (
          <span className="text-sm text-gray-500">{existingRating.note}</span>
        )}
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => setIsEditing(true)}
            className="p-1 text-gray-400 hover:text-gray-600"
            title="Edit"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => deleteMutation.mutate()}
            disabled={isLoading}
            className="p-1 text-gray-400 hover:text-red-600"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Edit/Create mode
  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex items-center gap-2">
        <StarRating value={stars} onChange={setStars} size="md" />
        {existingRating && (
          <div className="flex gap-1 ml-auto">
            <button
              type="submit"
              disabled={stars === 0 || isLoading}
              className="p-1 text-green-600 hover:text-green-700"
              title="Save"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="p-1 text-gray-400 hover:text-gray-600"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note (optional)"
        className="w-full px-2 py-1 text-sm border rounded"
      />
      {!existingRating && (
        <button
          type="submit"
          disabled={stars === 0 || isLoading}
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? 'Saving...' : 'Rate'}
        </button>
      )}
    </form>
  );
}
