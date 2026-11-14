# Checking in from your phone

You don't need to check in at all: autopilot writes `my-game/MORNING.md` and that's enough. But if you want to peek,
or stop it, without walking to the laptop, here are the options. Set them up before you leave and try them once while
you're still at the computer.

## Claude Code: Remote Control (the easiest)

1. In the session that runs autopilot, type `/remote-control` (or `/rc`). Or start Claude Code with
   `claude --remote-control`. The desktop app has the same command, and a setting to turn it on for every session.
2. On your phone, install the Claude app and sign in with the same account. The session appears in its Code section
   (or the Code section of the Claude website in any browser).
3. You can read what it's doing, see its agents' progress, and type messages: "how's it going?", "show me MORNING.md",
   "wrap up". Allow the app's notifications if you want to hear when it needs you.

It needs you signed in with a Claude subscription (not an API key). The laptop must stay on and awake; if it sleeps or
the Wi-Fi drops, the session reconnects when it comes back.

## Codex and Cursor

- **Cursor cloud agents** can be followed at cursor.com/agents or in Cursor's phone app. An agent running inside Cursor
  on your laptop usually can't.
- **Codex:** check the current Codex docs for remote access to a session running on your computer. Cloud tasks can be
  seen from the web, but they don't run your game on your computer.

## Any tool: a remote-desktop app

A remote-desktop app (for example Chrome Remote Desktop, or Screen Sharing between Macs) shows the laptop's screen on
your phone. It works with any tool. Set it up and test it before you leave. Be gentle: a click in the wrong place can
stop the run.

## Stopping from your phone

- With Remote Control: send "wrap up". The agent finishes the current change, saves and writes MORNING.md.
- With remote desktop: create `my-game/WRAP-UP.md` (copy `autopilot/WRAP-UP.template.md`) or type "wrap up" in the
  agent's window.

## Honest limits

- **The "Play it now" link only works on the laptop itself.** `http://localhost:...` means "this computer". Your
  phone can't open it, not even on the same Wi-Fi, unless the game server is opened to the local network, which the
  kit doesn't do by default (anyone on that Wi-Fi could then open it too). If you want to play on your phone at home,
  ask the agent; it will tell you what that changes. And many games are made for keyboard and mouse, so a phone may not
  be able to play them anyway.
- **Seeing MORNING.md remotely:** ask through Remote Control ("show me MORNING.md"), read it over remote desktop, or
  read the agent's last message, which repeats the important part. Autopilot never pushes or uploads anything, so the
  report isn't on GitHub or any website unless you put it there yourself.
- **Recordings and pictures** are files on the laptop. Through Remote Control you can ask the agent to describe them;
  to watch them, use remote desktop or wait until you're back.
