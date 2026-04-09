import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settings } from '@/lib/api';
import { Settings, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ApiTokensSection } from '@/components/ApiTokensSection';
import { cn } from '@/lib/utils';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type LlmMode = 'disabled' | 'direct' | 'n8n';

export function AdminSettingsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settings.get(),
  });

  // General settings state
  const [weekStartDay, setWeekStartDay] = useState(0);
  const [recencyWindowDays, setRecencyWindowDays] = useState(30);

  // AI & Video settings state
  const [llmMode, setLlmMode] = useState<LlmMode>('disabled');
  const [ollamaUrl, setOllamaUrl] = useState('');
  const [ollamaModel, setOllamaModel] = useState('gemma4-e4b');
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState('');
  const [videoStorageLimitMb, setVideoStorageLimitMb] = useState(10240);

  // Ollama connection test state
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    if (data?.settings) {
      const s = data.settings;
      setWeekStartDay(s.weekStartDay);
      setRecencyWindowDays(s.recencyWindowDays);
      setLlmMode(s.llmMode ?? 'disabled');
      setOllamaUrl(s.ollamaUrl ?? '');
      setOllamaModel(s.ollamaModel ?? 'gemma4-e4b');
      setN8nWebhookUrl(s.n8nWebhookUrl ?? '');
      setVideoStorageLimitMb(s.videoStorageLimitMb ?? 10240);
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

  const aiVideoMutation = useMutation({
    mutationFn: () =>
      settings.update({
        llmMode,
        ollamaUrl: ollamaUrl.trim() || null,
        ollamaModel: ollamaModel.trim(),
        n8nWebhookUrl: n8nWebhookUrl.trim() || null,
        videoStorageLimitMb,
      }),
    onSuccess: () => {
      toast.success('AI & Video settings saved');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error) => {
      toast.error('Failed to save AI & Video settings');
      console.error('Error saving AI settings:', error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  const handleAiVideoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    aiVideoMutation.mutate();
  };

  async function handleTestConnection() {
    setTestStatus('testing');
    setTestMessage('');
    try {
      const result = await settings.testOllamaConnection(ollamaUrl, ollamaModel || undefined);
      if (result.available && result.modelFound !== false) {
        setTestStatus('ok');
        setTestMessage(
          result.modelFound
            ? `Connected — model ${ollamaModel} is ready`
            : `Connected to ${ollamaUrl}`
        );
      } else if (result.available && result.modelFound === false) {
        setTestStatus('error');
        setTestMessage(
          `Ollama reachable but model '${ollamaModel}' not found — check the model name`
        );
      } else {
        setTestStatus('error');
        setTestMessage('Ollama is not reachable at the configured URL');
      }
    } catch {
      setTestStatus('error');
      setTestMessage('Connection test failed');
    }
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Application Settings</h1>
      </div>

      {/* General Settings */}
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

      {/* AI & Video Settings */}
      <form onSubmit={handleAiVideoSubmit} className="bg-card border rounded-lg p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-1">AI &amp; Video</h2>
          <p className="text-sm text-muted-foreground">
            Configure AI-powered recipe extraction from videos and LLM integration.
          </p>
        </div>

        {/* LLM Mode */}
        <div>
          <label className="block text-sm font-medium mb-2">LLM Mode</label>
          <div className="flex flex-col gap-2">
            {(
              [
                { value: 'disabled', label: 'Disabled', description: 'No AI extraction' },
                {
                  value: 'direct',
                  label: 'Direct (Ollama)',
                  description: 'Connect directly to a local Ollama instance',
                },
                {
                  value: 'n8n',
                  label: 'n8n',
                  description: 'Route requests through an n8n webhook',
                },
              ] as const
            ).map(({ value, label, description }) => (
              <label
                key={value}
                className={cn(
                  'flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted',
                  llmMode === value && 'border-primary bg-primary/5'
                )}
              >
                <input
                  type="radio"
                  name="llmMode"
                  value={value}
                  checked={llmMode === value}
                  onChange={() => {
                    setLlmMode(value);
                    setTestStatus('idle');
                  }}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Ollama fields */}
        {llmMode === 'direct' && (
          <div className="space-y-4 pl-1">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="ollama-url">
                Ollama URL
              </label>
              <input
                id="ollama-url"
                type="url"
                value={ollamaUrl}
                onChange={(e) => {
                  setOllamaUrl(e.target.value);
                  setTestStatus('idle');
                }}
                placeholder="http://192.168.0.250:11434"
                className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="ollama-model">
                Ollama Model
              </label>
              <input
                id="ollama-model"
                type="text"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                placeholder="gemma4-e4b"
                className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testStatus === 'testing' || !ollamaUrl.trim()}
                className="flex items-center gap-2 py-2 px-4 border rounded-md hover:bg-muted text-sm disabled:opacity-50"
              >
                {testStatus === 'testing' && <Loader2 className="h-4 w-4 animate-spin" />}
                {testStatus === 'ok' && <CheckCircle className="h-4 w-4 text-green-500" />}
                {testStatus === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
                Test Connection
              </button>
              {testMessage && (
                <p
                  className={cn(
                    'text-xs mt-1',
                    testStatus === 'ok' ? 'text-green-600' : 'text-destructive'
                  )}
                >
                  {testMessage}
                </p>
              )}
            </div>
          </div>
        )}

        {/* n8n webhook */}
        {llmMode === 'n8n' && (
          <div className="pl-1">
            <label className="block text-sm font-medium mb-1" htmlFor="n8n-url">
              n8n Webhook URL
            </label>
            <input
              id="n8n-url"
              type="url"
              value={n8nWebhookUrl}
              onChange={(e) => setN8nWebhookUrl(e.target.value)}
              placeholder="https://your-n8n-instance.com/webhook/..."
              className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}

        {/* Video Storage Limit */}
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="video-storage-limit">
            Video Storage Limit (MB)
          </label>
          <input
            id="video-storage-limit"
            type="number"
            min={100}
            max={102400}
            value={videoStorageLimitMb}
            onChange={(e) => setVideoStorageLimitMb(Number(e.target.value))}
            className="w-40 px-3 py-2 border rounded-md bg-background tabular-nums"
          />
          <p className="text-sm text-muted-foreground mt-1">
            Maximum total disk space for downloaded videos. Default: 10240 MB (10 GB).
          </p>
        </div>

        <div className="pt-4 border-t">
          <button
            type="submit"
            disabled={aiVideoMutation.isPending}
            className="py-2 px-4 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {aiVideoMutation.isPending ? 'Saving...' : 'Save AI & Video Settings'}
          </button>
        </div>
      </form>

      <div>
        <ApiTokensSection />
      </div>
    </div>
  );
}
