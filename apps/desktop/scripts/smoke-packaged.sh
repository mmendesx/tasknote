#!/usr/bin/env bash
# Launches the packaged app and asserts the embedded API boots inside it.
# Catches native-module ABI mismatches (better-sqlite3 vs Electron) and missing
# bundled dependencies — neither is visible to the plain-Node smoke test, which
# runs against the pre-package build output.
set -euo pipefail

case "$(uname -s)" in
  Darwin)
    APP=$(ls -d dist-electron/mac*/*.app 2>/dev/null | head -1)
    [ -n "$APP" ] || { echo "No .app found in dist-electron/"; exit 1; }
    RUNNER="$APP/Contents/MacOS/$(basename "$APP" .app)"
    LAUNCH=("$RUNNER")
    CONFIG_DIR="$HOME/Library/Application Support"
    ;;
  Linux)
    APPIMAGE=$(ls dist-electron/*.AppImage 2>/dev/null | head -1)
    [ -n "$APPIMAGE" ] || { echo "No AppImage found in dist-electron/"; exit 1; }
    # CI has no FUSE — extract and run AppRun directly.
    "$APPIMAGE" --appimage-extract >/dev/null
    # AppRun resolves the binary via $APPDIR; unset when invoked outside AppImage runtime.
    export APPDIR="$PWD/squashfs-root"
    LAUNCH=(xvfb-run -a "squashfs-root/AppRun" --no-sandbox)
    CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}"
    ;;
  *)
    echo "Unsupported platform: $(uname -s)"; exit 1 ;;
esac

# userData dir name depends on how Electron resolves app.name in the packaged
# build — find main.log instead of assuming it.
# BSD find rejects -delete alongside -maxdepth (exits 1), so use -exec rm.
find "$CONFIG_DIR" -maxdepth 3 -name main.log -exec rm -f {} + 2>/dev/null || true
# `|| true` inside: with pipefail, find's nonzero exit (permission-denied
# entries under Application Support are normal) would otherwise abort the poll.
findlog() { { find "$CONFIG_DIR" -maxdepth 3 -name main.log 2>/dev/null || true; } | head -1; }

"${LAUNCH[@]}" &
PID=$!
trap 'kill $PID 2>/dev/null || true; rm -rf squashfs-root' EXIT

for _ in $(seq 1 30); do
  LOG=$(findlog) || true
  if [ -n "$LOG" ] && grep -q "Nest API listening" "$LOG"; then
    echo "Packaged smoke OK: API booted inside the packaged app (log: $LOG)"
    exit 0
  fi
  if ! kill -0 $PID 2>/dev/null; then
    echo "Packaged app exited before API boot. Log ($LOG):"
    cat "$LOG" 2>/dev/null || echo "(no log)"
    exit 1
  fi
  sleep 1
done

LOG=$(findlog)
echo "Timed out waiting for API boot. Log ($LOG):"
cat "$LOG" 2>/dev/null || echo "(no log found under $CONFIG_DIR)"
ls "$CONFIG_DIR" || true
exit 1
