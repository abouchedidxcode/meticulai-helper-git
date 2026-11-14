# fal generation (optional, costs money)

`gen.mjs` asks fal.ai, a paid online service, to make pictures, short clips, sounds, music and 3D models for your
game. You do not need it: many good games use free assets or shapes made in code. It is there for when you want a
look, a sound or a prop nobody else has.

You need a fal account with a small balance and a key. How to set that up: [guides/fal-key.md](../../guides/fal-key.md).

## What it costs (estimates, checked 2026-11; prices change)

| What | Roughly |
| --- | --- |
| One style picture, keyframe, edit or texture | 15 cents |
| A 5-second video clip | 80 cents |
| A 2-second sound effect | less than 1 cent |
| 30 seconds of music | 30 cents |
| A 3D model | about 30 cents (not confirmed) |

`node tools/fal/gen.mjs models` shows the exact model and estimated price for each kind. If a price matters, check
the model's page on fal.ai: fal changes prices and the kit cannot see your bill.

## The money rules it follows

- **A budget you set.** `falCapUSD` in `my-game/helper.json`. It starts at 0, which means generation is off.
  Your agent sets it when you tell it a number ("set my fal budget to $10").
- **It shows the cost first.** Before every batch it prints what it will make, how many, the cost of each, the
  total, what you have spent so far and your budget, then asks "Run? (y/n)".
- **It refuses to go over the budget.** If the batch would pass the budget, nothing is sent. It checks again before
  every single call, in case another agent spent money in the meantime.
- **It logs every call.** One row per call in `my-game/paid-ledger.md` (for you to read) and one line in
  `my-game/.helper/fal-ledger.jsonl` (for the tools). "Spent so far" is the total of that log.
- **Your key stays secret.** It is read from the `.env` file (or the FAL_KEY setting) and is never shown,
  written to a file or put in a log.

## For agents

```
node tools/fal/gen.mjs <kind> ... --dry-run     # plan, cost and the exact request; sends nothing
node tools/fal/gen.mjs <kind> ... --yes         # run, after the user has said yes to that cost
node tools/fal/gen.mjs status                   # spent vs budget, last 10 calls
node tools/fal/gen.mjs models                   # models and prices
```

- Always run `--dry-run` first, show the user the plan and the cost in plain words, and wait for their yes.
  Then run the same command with `--yes`. Without `--yes` the tool waits for "y" typed on the keyboard, and if
  nobody answers it makes nothing.
- Never raise `falCapUSD` without the user's yes to the new number.
- Results land in `my-game/refs/generated/<kind>/<stamp>-<words>-<n>.<ext>`. Show pictures to the user side by side
  and let them pick. Read [PROMPTS.md](PROMPTS.md) before writing prompts.
- Exit codes: 0 done, 1 error or some items failed, 3 generation is off (budget 0), 4 over budget, 5 no key.
- To use another fal model for a kind, edit `models.json` (endpoint, input fields, where the file is in the answer,
  price, date checked). The tool also searches the whole answer for a file link if the listed places are empty.
- Never call fal from the game itself. Generate ahead of time and ship the files.
