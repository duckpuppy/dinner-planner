/**
 * Runtime switches for Ollama requests. Read lazily from process.env so tests can toggle them.
 */

export const DEFAULT_OLLAMA_NUM_CTX = 4096;
export const DEFAULT_OLLAMA_KEEP_ALIVE = '5m';
export const DEFAULT_OLLAMA_TEMPERATURE = 0;

/**
 * OLLAMA_NUM_CTX: context window (tokens) requested per call. Default 4096: typical imports are
 * well under ~1k tokens, and a larger window raises KV-cache VRAM at model load, which can fail
 * with out-of-memory on shared-GPU hosts. Raise it (e.g. 8192) for long video transcripts.
 * Must be a positive integer.
 */
export function getOllamaNumCtx(): number {
  const raw = process.env.OLLAMA_NUM_CTX?.trim();
  if (!raw) return DEFAULT_OLLAMA_NUM_CTX;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_OLLAMA_NUM_CTX;
}

/**
 * OLLAMA_KEEP_ALIVE: how long Ollama keeps the model loaded after a call ("5m", "30m", "-1"
 * for forever, "0" to unload immediately). Default 5m (Ollama's own default) so a shared GPU is
 * not held longer than needed. Bare integers are sent as numbers (seconds).
 */
export function getOllamaKeepAlive(): string | number {
  const raw = process.env.OLLAMA_KEEP_ALIVE?.trim();
  if (!raw) return DEFAULT_OLLAMA_KEEP_ALIVE;
  return /^-?\d+$/.test(raw) ? Number(raw) : raw;
}

/** OLLAMA_TEMPERATURE: sampling temperature, >= 0. Default 0 (deterministic extraction). */
export function getOllamaTemperature(): number {
  const raw = process.env.OLLAMA_TEMPERATURE?.trim();
  if (!raw) return DEFAULT_OLLAMA_TEMPERATURE;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_OLLAMA_TEMPERATURE;
}
