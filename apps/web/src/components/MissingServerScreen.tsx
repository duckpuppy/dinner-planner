import { ServerOff } from 'lucide-react';

export function MissingServerScreen() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background p-6 text-center text-foreground">
      <ServerOff className="size-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-balance text-xl font-semibold">This build has no server configured</h1>
      <p className="max-w-sm text-pretty text-sm text-muted-foreground">
        The app was built without a server address (<code>VITE_API_ORIGIN</code>), so it has nowhere
        to connect. Install a build that was configured for your Dinner Planner server.
      </p>
    </main>
  );
}
