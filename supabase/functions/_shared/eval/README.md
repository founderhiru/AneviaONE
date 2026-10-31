# Extraction accuracy harness

Measures how accurately report reading works, using **synthetic reports only** (fake people, generated values, answer keys). It does not call the AI provider by itself; it generates the PDFs and scores whatever the app read from them.

- `corpus.ts` — 24 common tests, 5 printed layouts, 3 date styles; deterministic from a seed.
- `score.ts` — recall, precision, per-field accuracy and the wrong-value rate, using the pipeline's own parsers.
- `cli.ts` — `generate` and `score` commands (usage in the file header).

Not covered yet: scanned/photographed pages, handwriting, Hindi/Telugu. Add those as separate corpora so each gets its own score.
