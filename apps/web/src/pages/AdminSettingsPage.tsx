import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settings } from '@/lib/api';
import { Settings } from 'lucide-react';
import { toast } from 'sonner';
import { ApiTokensSection } from '@/components/ApiTokensSection';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function AdminSettingsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settings.get(),
  });

  const [weekStartDay, setWeekStartDay] = useState(0);
  const [recencyWindowDays, setRecencyWindowDays] = useState(30);

  useEffect(() => {
    if (data?.settings) {
      setWeekStartDay(data.settings.weekStartDay);
      setRecencyWindowDays(data.settings.recencyWindowDays);
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: () => settings.update({ weekStartDay, recencyWindowDays }),
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

          <div>
            <label className="block text-sm font-medium mb-2">
              Suggestion Recency Window (days)
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={recencyWindowDays}
              onChange={(e) => setRecencyWindowDays(Number(e.target.value))}
              className="w-32 px-3 py-2 border rounded-md bg-background"
            />
            <p className="text-sm text-muted-foreground mt-1">
              Dishes made within this many days are penalized in meal suggestions. Default: 30.
            </p>
          </div>

          <div className="flex gap-2 pt-4 border-t">
            <button
              type="submit"
              disabled={
                updateMutation.isPending ||
                (weekStartDay === data?.settings.weekStartDay &&
                  recencyWindowDays === data?.settings.recencyWindowDays)
              }
              className="py-2 px-4 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

      <div className="mt-6">
        <ApiTokensSection />
      </div>
    </div>
  );
}
