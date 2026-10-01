// Generated once per process start; changes when the server restarts (e.g. after
// redeployment). Exposed on /health and used to namespace SSE event ids so a
// client can tell that its Last-Event-ID belongs to a previous process.
export const INSTANCE_ID = crypto.randomUUID();
