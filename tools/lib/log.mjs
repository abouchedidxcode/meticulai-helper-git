// Plain-language printing for every tool. A beginner reads this output, so keep it short and kind.
// Technical detail goes through detail(), which only prints with --verbose (or HELPER_VERBOSE=1).

let verbose = process.argv.includes('--verbose') || process.env.HELPER_VERBOSE === '1';

export const setVerbose = (on) => { verbose = !!on; };
export const isVerbose = () => verbose;

/** An error a person can act on: `message` says what went wrong, `next` says what to do now. */
export class HelperError extends Error {
  constructor(message, next = '', cause = null) {
    super(message);
    this.next = next;
    if (cause) this.cause = cause;
  }
}

export const say = (msg = '') => console.log(msg);
export const ok = (msg) => console.log(`  ok    ${msg}`);
export const warn = (msg) => console.log(`  note  ${msg}`);
export const bad = (msg) => console.log(`  !!    ${msg}`);
export const step = (msg) => console.log(`${msg}...`);

/** Only shown with --verbose. Accepts strings, errors and objects. */
export function detail(...parts) {
  if (!verbose) return;
  for (const p of parts) {
    if (p instanceof Error) console.log(`  [detail] ${p.stack || p.message}`);
    else if (typeof p === 'object' && p !== null) console.log(`  [detail] ${JSON.stringify(p, null, 2)}`);
    else console.log(`  [detail] ${p}`);
  }
}

export const nextStep = (msg) => console.log(`\nWhat to do next: ${msg}`);

/** The card every hand-back ends with. Keep the exact wording: skills and agents copy it. */
export function playCard(url) {
  console.log(`\n▶ Play it now: ${url}\n\n(The game is running on your computer. Click the link to open it.)`);
}

/** Print a failure in plain words with a next step, then exit non-zero. */
export function fail(message, next = '', err = null) {
  console.log(`\nSomething went wrong: ${message}`);
  if (err) detail(err);
  if (next) nextStep(next);
  if (!verbose) console.log('(For the technical details, run the same command again with --verbose.)');
  process.exit(1);
}

/** Run a tool's main(). Any thrown error becomes a plain message + next step + exit 1. */
export async function runTool(main) {
  try {
    const code = await main();
    if (typeof code === 'number' && code !== 0) process.exit(code);
  } catch (e) {
    if (e instanceof HelperError) fail(e.message, e.next, e.cause || e);
    else fail(e?.message || String(e), 'Run the command again with --verbose and show the output to your agent.', e);
  }
}

/** Human sizes: 1.2 MB */
export function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}
