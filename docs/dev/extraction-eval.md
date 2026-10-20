# Recipe extraction eval

`apps/api/scripts/eval-extraction.ts` runs the real extraction path (`extractRecipeFromTextDetailed`, including the schema `format`, `num_ctx` and input trimming) against one or more Ollama models and prints a comparison. Use it to choose a model or check that a change did not hurt quality or latency. It needs a reachable Ollama server; nothing in CI runs it.

```bash
cd apps/api
OLLAMA_URL=http://192.168.0.250:11434 pnpm eval:extraction -- --model gemma4-e4b --model other-model
# optional: --fixtures <dir>   (default scripts/fixtures/extraction)
# optional: --db /path/to/dinner.db   (a COPY of the prod DB; opened read-only)
```

`OLLAMA_NUM_CTX`, `OLLAMA_KEEP_ALIVE` and `OLLAMA_TEMPERATURE` apply as in the app.

## Fixtures

JSON files in `scripts/fixtures/extraction/`:

```json
{
  "name": "...",
  "title": "...",
  "description": "...",
  "transcript": "...",
  "comments": "...",
  "expectRecipe": true
}
```

Only `name` and `title` are required. `expectRecipe` marks whether a usable recipe should come out; mismatches are flagged in the table. The bundled set covers: a caption with a full recipe, "recipe in comments", transcript-only, a non-recipe post, a long post (about 11k assembled chars, close to the 4096-token Ollama default), a caption that only says the recipe is behind a link in the comments, and a one-line food caption. The last two (plus the non-recipe post) are `expectRecipe: false` and guard against the model returning placeholder prose such as "No detailed instructions provided" instead of nothing.

With `--db`, every completed `video_jobs` row with `result_metadata` is added (title, description and up to 10 comments from the stored yt-dlp info, plus `transcript`). These have no expectation.

## Output

One row per model and case: `usable` (recipe extracted), `no_recipe` (model ran, nothing usable), or `invalid` (unreadable output or an error), then wall time in ms and Ollama's `prompt_eval_count`. A `prompt_eval_count` close to `num_ctx` means the prompt was probably truncated. A summary per model gives the usable rate, how many cases matched `expectRecipe`, and median latency. The first call per model includes model load time, so run it twice, or compare `load_duration` in the server logs, when judging latency.
