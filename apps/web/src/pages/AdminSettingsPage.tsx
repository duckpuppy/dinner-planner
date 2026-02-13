import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settings } from '@/lib/api';
import { Settings } from 'lucide-react';
import { toast } from 'sonner';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function AdminSettingsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settings.get(),
  });

  const [weekStartDay, setWeekStartDay] = useState(0);

  useEffect(() => {
    if (data?.settings) {
      setWeekStartDay(data.settings.weekStartDay);
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: () => settings.update({ weekStartDay }),
    onSuccess: () => {
      toast.success('Settings saved successfully');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['menus'] });
    },
    onError: (error) => {
      toast.error('Failed to save settings');
      console.error('Error saving settings:', error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Application Settings</h1>
      </div>

      {isLoading ? (
        <div className="bg-card border rounded-lg p-6 animate-pulse">
          <div className="h-6 bg-muted rounded w-32 mb-4" />
          <div className="h-10 bg-muted rounded" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-card border rounded-lg p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Week Start Day</label>
            <select
              value={weekStartDay}
              onChange={(e) => setWeekStartDay(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              {DAYS.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground mt-1">
              Choose which day of the week should be displayed first in the weekly menu view.
            </p>
          </div>

          <div className="flex gap-2 pt-4 border-t">
            <button
              type="submit"
              disabled={updateMutation.isPending || weekStartDay === data?.settings.weekStartDay}
              className="py-2 px-4 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
