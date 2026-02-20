import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { prepTasks, type PrepTask } from '@/lib/api';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { useState, useRef } from 'react';
import { toast } from 'sonner';

interface PrepTaskListProps {
  entryId: string;
}

export function PrepTaskList({ entryId }: PrepTaskListProps) {
  const queryClient = useQueryClient();
  const [newDescription, setNewDescription] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['prepTasks', entryId],
    queryFn: () => prepTasks.list(entryId),
  });

  const tasks = data?.prepTasks ?? [];

  const createMutation = useMutation({
    mutationFn: (description: string) => prepTasks.create(entryId, description),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prepTasks', entryId] });
      setNewDescription('');
      inputRef.current?.focus();
    },
    onError: () => toast.error('Failed to add prep task'),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { description?: string; completed?: boolean };
    }) => prepTasks.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prepTasks', entryId] });
    },
    onError: () => toast.error('Failed to update prep task'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => prepTasks.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prepTasks', entryId] });
    },
    onError: () => toast.error('Failed to delete prep task'),
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newDescription.trim();
    if (!trimmed) return;
    createMutation.mutate(trimmed);
  }

  function handleToggle(task: PrepTask) {
    updateMutation.mutate({ id: task.id, data: { completed: !task.completed } });
  }

  function handleDelete(id: string) {
    deleteMutation.mutate(id);
  }

  return (
    <div className="space-y-2">
      {/* Task list */}
      {isLoading ? (
        <div className="space-y-1.5">
          {[1, 2].map((i) => (
            <div key={i} className="h-8 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      ) : tasks.length > 0 ? (
        <ul className="space-y-1" role="list" aria-label="Prep tasks">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                id={`prep-task-${task.id}`}
                checked={task.completed}
                onChange={() => handleToggle(task)}
                disabled={updateMutation.isPending}
                className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
              />
              <label
                htmlFor={`prep-task-${task.id}`}
                className={cn(
                  'flex-1 text-sm cursor-pointer select-none',
                  task.completed && 'line-through text-muted-foreground'
                )}
              >
                {task.description}
              </label>
              <button
                onClick={() => handleDelete(task.id)}
                disabled={deleteMutation.isPending}
                className="p-2 md:p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
                aria-label={`Delete prep task: ${task.description}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Add task form */}
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          placeholder="Add a prep task..."
          maxLength={500}
          disabled={createMutation.isPending}
          className="flex-1 px-2 py-1.5 text-sm border rounded-md bg-background
                     focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          aria-label="New prep task description"
        />
        <button
          type="submit"
          disabled={!newDescription.trim() || createMutation.isPending}
          className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md
                     hover:bg-primary/90 disabled:opacity-50 font-medium"
        >
          {createMutation.isPending ? 'Adding...' : 'Add'}
        </button>
      </form>
    </div>
  );
}
