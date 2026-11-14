#!/usr/bin/env bash
# Keep the computer awake while autopilot runs, so it doesn't fall asleep halfway through the night.
#
#   bash autopilot/keep-awake.sh <hours>     e.g. 8, or 0.5 for half an hour
#   bash autopilot/keep-awake.sh --status    is it on, and until when?
#   bash autopilot/keep-awake.sh --stop      let the computer sleep normally again
#
# macOS: caffeinate (built in) keeps the screen, disk and system awake. Works on battery too, but drains it.
# Linux: systemd-inhibit blocks sleep and idle. Elsewhere it explains how to do it by hand.
# It runs in the background and stops by itself after <hours>. Starting it again replaces the old one.
# A laptop still sleeps when you CLOSE THE LID (unless it's plugged into a monitor, keyboard and power). Keep it open.
set -u

PIDFILE="${TMPDIR:-/tmp}"; PIDFILE="${PIDFILE%/}/meticulai-keep-awake.pid"

say() { printf '%s\n' "$*"; }

running_pid() {
  [ -f "$PIDFILE" ] || return 1
  local pid; pid=$(sed -n 1p "$PIDFILE")
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && { printf '%s' "$pid"; return 0; }
  rm -f "$PIDFILE"; return 1
}

stop_it() {
  local pid
  if pid=$(running_pid); then
    kill "$pid" 2>/dev/null
    rm -f "$PIDFILE"
    say "Stopped. The computer can sleep normally again."
  else
    say "Keep-awake wasn't running."
  fi
}

case "${1:-}" in
  --stop) stop_it; exit 0 ;;
  --status)
    if pid=$(running_pid); then say "Keep-awake is on (process $pid), until $(sed -n 2p "$PIDFILE")."
    else say "Keep-awake is off."; fi
    exit 0 ;;
  ""|-h|--help) sed -n '2,11p' "$0"; exit 0 ;;
esac

HOURS=$1
printf '%s' "$HOURS" | grep -Eq '^[0-9]+([.][0-9]+)?$' || { say "Give the number of hours, e.g.: bash autopilot/keep-awake.sh 8"; exit 1; }
SECS=$(awk -v h="$HOURS" 'BEGIN { s = int(h * 3600 + 0.5); print s }')
[ "$SECS" -ge 1 ] || { say "That's less than a second. Give the hours, e.g. 8."; exit 1; }
[ "$SECS" -le 172800 ] || { say "That's more than 48 hours. Pick a shorter run; you can start it again later."; exit 1; }

# Replace any earlier keep-awake, so there's only ever one.
if old=$(running_pid); then kill "$old" 2>/dev/null; rm -f "$PIDFILE"; fi

UNTIL=$(date -r $(( $(date +%s) + SECS )) '+%H:%M on %a %d %b' 2>/dev/null || date -d "@$(( $(date +%s) + SECS ))" '+%H:%M on %a %d %b' 2>/dev/null || echo "in $HOURS hours")

case $(uname -s) in
  Darwin)
    if pmset -g batt 2>/dev/null | grep -q "Battery Power"; then
      say "Warning: this Mac is running on battery. Plug it in: a long run will drain it, and the Mac sleeps when the"
      say "battery runs low no matter what."
    fi
    # -d display, -i idle, -m disk, -s system (the -s part only counts while plugged in), -u "user is active".
    nohup caffeinate -dimsu -t "$SECS" >/dev/null 2>&1 &
    PID=$!
    ;;
  Linux)
    for b in /sys/class/power_supply/BAT*/status; do
      [ -f "$b" ] && grep -qi discharging "$b" && say "Warning: this computer is running on battery. Plug it in for a long run."
    done
    if command -v systemd-inhibit >/dev/null 2>&1; then
      nohup systemd-inhibit --what=sleep:idle:handle-lid-switch --who="game autopilot" \
        --why="Autopilot is working on the game" --mode=block sleep "$SECS" >/dev/null 2>&1 &
      PID=$!
    else
      say "This Linux has no systemd-inhibit. Turn off automatic sleep in your power settings for the length of the run,"
      say "and turn it back on afterwards."
      exit 1
    fi
    ;;
  *)
    say "On this system, turn off sleep by hand: Windows: Settings > System > Power > Screen and sleep > set 'When"
    say "plugged in, put my device to sleep after' to Never (put it back afterwards). Or run: powercfg /change standby-timeout-ac 0"
    exit 1
    ;;
esac

disown "$PID" 2>/dev/null || true
sleep 1
if ! kill -0 "$PID" 2>/dev/null; then say "Couldn't start keep-awake."; exit 1; fi
printf '%s\n%s\n' "$PID" "$UNTIL" > "$PIDFILE"

say "The computer will stay awake until $UNTIL (process $PID)."
say "Keep the lid open and the charger in."
say "To stop it early:  bash autopilot/keep-awake.sh --stop"
