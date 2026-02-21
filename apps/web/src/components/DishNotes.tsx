import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dishNotes as dishNotesApi, type DishNote } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Trash2, StickyNote, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DishNotesProps {
  dishId: string;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

export function DishNotes({ dishId }: DishNotesProps) {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [noteText, setNoteText] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['dishNotes', dishId],
    queryFn: () => dishNotesApi.list(dishId),
  });

  const notes: DishNote[] = data?.notes ?? [];

  const createMutation = useMutation({
    mutationFn: (note: string) => dishNotesApi.create(dishId, note),
    onSuccess: () => {
      setNoteText('');
      queryClient.invalidateQueries({ queryKey: ['dishNotes', dishId] });
      toast.success('Note added');
    },
    onError: () => toast.error('Failed to add note'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => dishNotesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dishNotes', dishId] });
      toast.success('Note deleted');
    },
    onError: () => toast.error('Failed to delete note'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = noteText.trim();
    if (!trimmed) return;
    createMutation.mutate(trimmed);
  }

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground mb-2">Cook Notes</h2>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading notes...
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground italic mb-3">
          No notes yet — add your first cook note
        </p>
      ) : (
        <ul className="space-y-2 mb-3">
          {notes.map((note) => (
            <li key={note.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/40 text-sm">
              <StickyNote className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="whitespace-pre-wrap text-pretty">{note.note}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {note.createdByUsername ?? 'Unknown user'} &middot;{' '}
                  {formatRelativeDate(note.createdAt)}
                </p>
              </div>
              {note.createdById === user?.id && (
                <button
                  onClick={() => deleteMutation.mutate(note.id)}
                  disabled={deleteMutation.isPending}
                  className={cn(
                    'p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive',
                    'flex-shrink-0 disabled:opacity-50'
                  )}
                  aria-label={`Delete note by ${note.createdByUsername ?? 'unknown'}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={3}
          placeholder="Add a cook note..."
          className="w-full px-3 py-2 border rounded-md bg-background resize-none text-sm
                     focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Cook note"
        />
        <button
          type="submit"
          disabled={!noteText.trim() || createMutation.isPending}
          className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-md',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {createMutation.isPending ? 'Adding...' : 'Add note'}
        </button>
      </form>
    </div>
  );
}
