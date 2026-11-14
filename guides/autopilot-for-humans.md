# Autopilot: leaving it running

Autopilot lets the agent keep improving your game for hours while you sleep or work. It's most useful on a big AI
plan, during hours you wouldn't use it anyway.

## What happens while you're away

The agent works in rounds. Each round:
1. It records the game being played by a simple bot.
2. Fresh AI reviewers watch the recording and say what's weakest.
3. It checks those comments against the actual game and picks the top one or two problems.
4. Helper agents fix them.
5. It checks the game still runs, and saves.

Then the next round starts, with new reviewers. A round usually takes somewhere between 30 minutes and two hours.

## Setting limits

Before it starts, the agent asks you three things, one at a time:

1. **How long.** For example, "8 hours".
2. **What it may decide on its own.** For example, "controls, sound, level layout, fixing bugs".
3. **What it must leave for you.** For example, "changing the main idea, the overall look, removing anything I asked
   for". Those come back as suggestions for you to approve, not changes.

Always true on autopilot, whatever you say:
- It doesn't spend money, unless you clearly told it to for this run, and never above your budget.
- It never publishes or shares anything.
- Every round ends with the game working and saved. A round that breaks the game is undone.

## Before you leave

- Plug in your laptop. The agent keeps the computer awake while it runs, but it can't charge the battery.
- Leave the agent's window open. Closing it stops the work.
- You can use your computer meanwhile, but heavy apps (video calls, games) slow both down.

## When you're back

The agent leaves a short report called `MORNING.md` in your game folder, and its last message says the same. It
starts with the **Play it now** link, then:
- the three biggest improvements, and what to try for each;
- what's still rough;
- questions waiting for you (yes or no);
- money spent (normally $0).

Play first, then answer the questions. Your notes (press N in the game) steer the next run.

## How to stop it

- **Gently:** tell the agent "stop after this round". It finishes, saves and writes the report.
- **Right now:** press **Esc** in the agent's window (or **Ctrl+C** in a terminal), or close the window. Everything
  from finished rounds is saved; only the round in progress is lost.

If you want to check in from your phone while it runs, ask the agent about remote access. It's optional.
