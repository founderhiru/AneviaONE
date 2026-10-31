/**
 * Accuracy harness command line. Synthetic data only.
 *
 *   # 1. Write fake report PDFs and their answer keys
 *   deno run --allow-write _shared/eval/cli.ts generate --count 100 --seed 1 --out /tmp/eval
 *
 *   # 2. Upload the PDFs to a TEST account and collect what the app read into
 *   #    one JSON file: { "<case id>": [ {test_name, raw_value, raw_unit, reference_range, observation_date}, ... ] }
 *
 *   # 3. Score it
 *   deno run --allow-read _shared/eval/cli.ts score --count 100 --seed 1 --extracted /tmp/extracted.json
 */
import { generateCorpus } from './corpus.ts';
import { formatReport, scoreCase, scoreCorpus, type Extracted } from './score.ts';
import { buildTextPdf } from '../health-engine/tests/fixtures.ts';

function arg(name: string, fallback?: string): string {
  const i = Deno.args.indexOf(`--${name}`);
  const v = i >= 0 ? Deno.args[i + 1] : fallback;
  if (v === undefined) throw new Error(`Missing --${name}`);
  return v;
}

const [command] = Deno.args;
const corpus = () => generateCorpus({ count: Number(arg('count', '100')), seed: Number(arg('seed', '1')) });

if (command === 'generate') {
  const out = arg('out');
  await Deno.mkdir(out, { recursive: true });
  const cases = corpus();
  for (const c of cases) {
    await Deno.writeFile(`${out}/${c.id}.pdf`, buildTextPdf(c.pages));
  }
  await Deno.writeTextFile(`${out}/answer-keys.json`, JSON.stringify(Object.fromEntries(cases.map((c) => [c.id, c.key])), null, 2));
  console.log(`Wrote ${cases.length} PDFs and answer-keys.json to ${out}`);
} else if (command === 'score') {
  const extracted = JSON.parse(await Deno.readTextFile(arg('extracted'))) as Record<string, Extracted[]>;
  const scores = corpus().map((c) => scoreCase(c, extracted[c.id] ?? []));
  console.log(formatReport(scoreCorpus(scores)));
} else {
  console.log('Usage: cli.ts generate --count N --seed S --out DIR | score --count N --seed S --extracted FILE');
  Deno.exit(1);
}
