/**
 * Offline evaluation of recipe extraction against one or more Ollama models.
 *
 *   OLLAMA_URL=http://host:11434 tsx scripts/eval-extraction.ts \
 *     --model gemma4-e4b [--model other] [--fixtures dir] [--db path/to/dinner.db]
 *
 * See docs/dev/extraction-eval.md. The DB (if given) is opened read-only.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import {
  extractRecipeFromTextDetailed,
  fitTextToContext,
  type GenerateReport,
} from '../src/services/ollama.js';
import { getOllamaNumCtx } from '../src/services/ollamaConfig.js';

interface Fixture {
  name: string;
  title: string;
  description?: string;
  transcript?: string;
  comments?: string;
  expectRecipe?: boolean;
}

type Verdict = 'usable' | 'no_recipe' | 'invalid';

interface Row {
  model: string;
  fixture: string;
  expect: boolean | null;
  verdict: Verdict;
  ms: number;
  promptEvalCount: number | null;
}

const MAX_TRANSCRIPT = 8000;
const MAX_COMMENTS = 8000;

/** Mirrors the section assembly in services/recipeExtraction.ts. */
export function assemble(f: Fixture): string {
  const sections: string[] = [];
  if (f.title) sections.push(f.title);
  if (f.description) sections.push(f.description);
  const t = f.transcript?.trim() ? f.transcript.slice(0, MAX_TRANSCRIPT) : '';
  if (t) sections.push(`Video transcript:\n${t}`);
  const c = f.comments?.trim() ? f.comments.slice(0, MAX_COMMENTS) : '';
  if (c) sections.push(`Video comments (the uploader's own comments first):\n${c}`);
  return sections.join('\n\n');
}

function parseArgs(argv: string[]) {
  const models: string[] = [];
  let fixtures = resolve(fileURLToPath(new URL('.', import.meta.url)), 'fixtures/extraction');
  let db: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--model') models.push(argv[++i]);
    else if (a === '--fixtures') fixtures = resolve(argv[++i]);
    else if (a === '--db') db = resolve(argv[++i]);
    else throw new Error(`Unknown argument: ${a}`);
  }
  return { models, fixtures, db };
}

function loadFixtures(dir: string): Fixture[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Fixture);
}

function loadJobs(dbPath: string): Fixture[] {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const rows = db
      .prepare(
        `SELECT id, result_metadata, transcript FROM video_jobs
         WHERE status = 'complete' AND result_metadata IS NOT NULL`
      )
      .all() as { id: string; result_metadata: string; transcript: string | null }[];
    const out: Fixture[] = [];
    for (const r of rows) {
      let info: Record<string, unknown>;
      try {
        info = JSON.parse(r.result_metadata) as Record<string, unknown>;
      } catch {
        continue;
      }
      const comments = Array.isArray(info['comments'])
        ? (info['comments'] as { text?: unknown }[])
            .map((c) => (typeof c?.text === 'string' ? c.text.trim() : ''))
            .filter(Boolean)
            .slice(0, 10)
            .join('\n---\n')
        : undefined;
      out.push({
        name: `job:${r.id.slice(0, 8)}`,
        title: typeof info['title'] === 'string' ? info['title'] : '',
        description: typeof info['description'] === 'string' ? info['description'] : '',
        transcript: r.transcript ?? undefined,
        comments,
      });
    }
    return out;
  } finally {
    db.close();
  }
}

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

async function main() {
  const { models, fixtures, db } = parseArgs(process.argv.slice(2));
  const ollamaUrl = process.env.OLLAMA_URL;
  if (!ollamaUrl) throw new Error('OLLAMA_URL is required');
  if (models.length === 0) throw new Error('At least one --model is required');

  const cases = [...loadFixtures(fixtures), ...(db ? loadJobs(db) : [])];
  if (cases.length === 0) throw new Error(`No fixtures found in ${fixtures}`);
  console.log(
    `Evaluating ${cases.length} case(s) x ${models.length} model(s) against ${ollamaUrl}\n`
  );

  const rows: Row[] = [];
  for (const model of models) {
    for (const c of cases) {
      const text = assemble(c);
      let promptEvalCount: number | null = null;
      const onReport = (r: GenerateReport) => {
        promptEvalCount = r.promptEvalCount;
      };
      const started = Date.now();
      const res = await extractRecipeFromTextDetailed(text, ollamaUrl, model, {
        retryDelaysMs: [0, 0],
        onReport,
      });
      const verdict: Verdict = res.recipe ? 'usable' : res.notUsable ? 'no_recipe' : 'invalid';
      rows.push({
        model,
        fixture: c.name,
        expect: c.expectRecipe ?? null,
        verdict,
        ms: Date.now() - started,
        promptEvalCount,
      });
    }
  }

  const pad = (v: string | number, n: number) => String(v).padEnd(n);
  console.log(
    `${pad('model', 16)}${pad('fixture', 30)}${pad('result', 11)}${pad('expect', 8)}${pad('ms', 8)}prompt_eval_count`
  );
  for (const r of rows) {
    const exp = r.expect === null ? '-' : r.expect ? 'recipe' : 'none';
    const mismatch =
      r.expect !== null && (r.verdict === 'usable') !== r.expect && r.verdict !== 'invalid';
    console.log(
      `${pad(r.model, 16)}${pad(r.fixture, 30)}${pad(r.verdict, 11)}${pad(exp, 8)}${pad(r.ms, 8)}${r.promptEvalCount ?? '-'}${mismatch ? '  <-- unexpected' : ''}`
    );
  }

  console.log('\nPer model');
  for (const model of models) {
    const mine = rows.filter((r) => r.model === model);
    const usable = mine.filter((r) => r.verdict === 'usable').length;
    const invalid = mine.filter((r) => r.verdict === 'invalid').length;
    const judged = mine.filter((r) => r.expect !== null);
    const correct = judged.filter(
      (r) => r.verdict !== 'invalid' && (r.verdict === 'usable') === r.expect
    ).length;
    console.log(
      `${pad(model, 16)}usable ${usable}/${mine.length} (${Math.round((100 * usable) / mine.length)}%)  ` +
        `invalid ${invalid}  ` +
        (judged.length ? `matches expectation ${correct}/${judged.length}  ` : '') +
        `median latency ${median(mine.map((r) => r.ms))}ms`
    );
  }

  // Sanity: how much would the input budget trim at the default context?
  const numCtx = getOllamaNumCtx();
  const trimmedCases = cases.filter((c) => fitTextToContext(assemble(c), numCtx, 1200).trimmed);
  if (trimmedCases.length) {
    console.log(
      `\nNote: ${trimmedCases.length} case(s) exceed the input budget at num_ctx=${numCtx} and are trimmed: ` +
        trimmedCases.map((c) => c.name).join(', ')
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
