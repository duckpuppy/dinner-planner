import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('file:./data/dinner.db'),
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().optional(),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  OLLAMA_URL: z.string().url().optional(),
  OLLAMA_MODEL: z.string().default('gemma4-e4b'),
  LLM_MODE: z.enum(['disabled', 'direct', 'n8n']).default('disabled'),
  N8N_WEBHOOK_URL: z.string().url().optional(),
  VIDEO_STORAGE_LIMIT_MB: z.coerce.number().int().min(100).default(10240),
  YTDLP_PATH: z.string().default('yt-dlp'),
  VIDEOS_DIR: z.string().optional(),
  VIDEO_CLEANUP_INTERVAL_HOURS: z.coerce.number().int().min(0).default(24),
  VIDEO_CLEANUP_TIME: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default('03:00'),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment configuration:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();

export type Config = typeof config;
