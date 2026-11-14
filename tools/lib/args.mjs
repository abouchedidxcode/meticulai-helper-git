// Command-line options for every tool, on top of node:util parseArgs.
// Every tool gets --help, --verbose and --dir <path> for free.
import { parseArgs as nodeParseArgs } from 'node:util';
import { HelperError, setVerbose } from './log.mjs';

/**
 * @param {object} spec  { name: { type: 'string'|'boolean'|'number', short?, default? } }
 * @param {string} help  text printed for --help
 * @returns {{ values: object, positionals: string[] }}  (exits after printing help)
 */
export function getArgs(spec = {}, help = '', argv = process.argv.slice(2)) {
  const options = {
    help: { type: 'boolean', short: 'h' },
    verbose: { type: 'boolean' },
    dir: { type: 'string' },
  };
  for (const [k, v] of Object.entries(spec)) {
    options[k] = { type: v.type === 'boolean' ? 'boolean' : 'string' };
    if (v.short) options[k].short = v.short;
  }
  let parsed;
  try {
    parsed = nodeParseArgs({ args: argv, options, allowPositionals: true, strict: true });
  } catch (e) {
    const m = /'(-{1,2}[^']+)'/.exec(e.message);
    throw new HelperError(
      m ? `I don't know the option ${m[1]}.` : `I couldn't read the options (${e.message}).`,
      'Run the same command with --help to see the options it takes.',
    );
  }
  const values = { ...parsed.values };
  if (values.help) {
    console.log(help.trim());
    process.exit(0);
  }
  setVerbose(!!values.verbose);
  for (const [k, v] of Object.entries(spec)) {
    if (values[k] === undefined && v.default !== undefined) values[k] = v.default;
    if (v.type === 'number' && values[k] !== undefined) {
      const n = Number(values[k]);
      if (!Number.isFinite(n)) throw new HelperError(`--${k} needs a number, but got "${values[k]}".`, `Try for example --${k} ${v.default ?? 10}.`);
      values[k] = n;
    }
  }
  return { values, positionals: parsed.positionals };
}
