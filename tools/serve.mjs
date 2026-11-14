#!/usr/bin/env node
// Start (or reuse) the game's dev server in the background, and with --check prove it draws without errors.
import { getArgs } from './lib/args.mjs';
import { HelperError, nextStep, ok, playCard, runTool, say, warn } from './lib/log.mjs';
import { gameDir, pretty } from './lib/paths.mjs';
import { checkGame, printProblems } from './lib/check.mjs';
import { ensureServer, serverStatus, stopServer } from './lib/server.mjs';

const HELP = `
node tools/serve.mjs [--check | --stop | --status | --restart]

Starts your game on this computer (in the background) and prints the link to play it.
If it is already running, it reuses it, so the link never changes.

  (no option)   start the game if needed and print the link
  --check       also open the game in a hidden browser and make sure it starts,
                runs without errors and shows something on screen. Agents run this
                before every hand-back.
  --status      say whether the game is running
  --stop        stop the game
  --restart     stop it and start it again
  --dir <path>  use a different game folder (default: my-game/)
  --verbose     show technical details
`;

await runTool(async () => {
  const { values: a } = getArgs({ check: { type: 'boolean' }, stop: { type: 'boolean' }, status: { type: 'boolean' }, restart: { type: 'boolean' } }, HELP);
  const dir = gameDir(a.dir);

  if (a.status) {
    const st = await serverStatus(dir);
    if (st.running) say(`Your game is running: ${st.url}`);
    else say(`Your game is not running. Start it with:  node tools/serve.mjs`);
    return 0;
  }
  if (a.stop || a.restart) {
    const r = await stopServer(dir);
    if (!r.wasRunning) say('Your game was not running.');
    else if (r.stopped) say('Stopped your game.');
    else throw new HelperError('I could not stop the game server.', 'Close the terminal window that started it, or restart your computer.');
    if (a.stop) return 0;
  }

  const srv = await ensureServer(dir);
  if (srv.pingOk === false) warn(`The game answered, but its helper add-on did not (in vite.config.js). Notes and tuning saves may not work.`);
  if (!a.check) {
    say(srv.started ? 'Your game is running.' : 'Your game was already running.');
    playCard(srv.url);
    return 0;
  }

  say('Checking that the game starts and draws (in a hidden browser)...');
  const res = await checkGame(`${srv.url.replace('localhost', '127.0.0.1')}/?test=1`, { label: `serve --check ${pretty(dir)}` });
  for (const w of res.warnings) warn(w);
  if (!res.ok) {
    printProblems(res);
    nextStep('Fix the first problem above, then run  node tools/serve.mjs --check  again. Do not hand the game back until this passes.');
    return 1;
  }
  ok('The game starts, runs without errors and draws on screen.');
  playCard(srv.url);
  return 0;
});
