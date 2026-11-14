# Costs

## What costs money

1. **Your AI agent's plan.** You already pay for this (Claude, ChatGPT, Cursor, or another). The kit uses it to
   think, build and review. Big runs (many helpers, autopilot) use more of your plan's allowance, not extra money.
2. **fal, only if you turn it on.** A service that generates pictures, sounds, music and 3D models. You pay fal
   directly, per thing generated, usually cents to a few dollars per batch. It's off by default.

**Nothing else.** The tools the agent installs are free. Free assets (from sites like Poly Haven, ambientCG, Kenney)
are free. Running the game on your computer is free. itch.io and GitHub Pages are free for sharing.

## How the fal budget works

- During the interview you set a budget. **The default is $0, which turns generation off.**
- Before every batch, the agent shows what it wants to make and what it costs, and waits for your yes.
- It keeps a running total and refuses to go over your budget. Only you can raise it.
- Every purchase is written down in `paid-ledger.md` in your game folder.
- The finished game never calls a paid service while someone plays it. Everything is made once and saved. So more
  players never means more cost.

To set it up, see [Your fal key](fal-key.md).

## Keeping it at $0

- Keep the budget at $0 (the default). The agent then uses free assets and things made in code: skies, water,
  particles, most sound effects and simple music. This works well.
- Never paste a key or card number into the chat.
- If the agent ever suggests something that would cost money, it has to ask you first. You can always say no.

## Using less of your AI plan

If you keep hitting your plan's limit:
- Ask the agent to use fewer helpers at once ("use 2 helpers").
- Ask for fewer, bigger rounds instead of many small ones.
- Run autopilot overnight, when you're not using the plan anyway.
- If it stops halfway, nothing is lost: when your allowance resets, say "Read START.md and continue my game."
