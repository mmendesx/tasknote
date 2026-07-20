#!/usr/bin/env bash
# Launches the packaged AppImage headlessly and asserts the embedded API boots.
# Catches native-module ABI mismatches (better-sqlite3 vs Electron) that the
# plain-Node smoke test cannot see. Requires xvfb-run on CI.
set -euo pipefail

APPIMAGE=$(ls dist-electron/*.AppImage | head -1)
[ -n "$APPIMAGE" ] || { echo "No AppImage found in dist-electron/"; exit 1; }

LOG="${XDG_CONFIG_HOME:-$HOME/.config}/TaskNote/main.log"
rm -f "$LOG"

# CI has no FUSE — extract and run AppRun directly.
"$APPIMAGE" --appimage-extract >/dev/null
RUNNER="squashfs-root/AppRun"
# AppRun resolves the binary via $APPDIR; unset when invoked outside AppImage runtime.
export APPDIR="$PWD/squashfs-root"

xvfb-run -a "$RUNNER" --no-sandbox &
PID=$!
trap 'kill $PID 2>/dev/null || true; rm -rf squashfs-root' EXIT

for _ in $(seq 1 30); do
  if grep -q "Nest API listening" "$LOG" 2>/dev/null; then
    echo "Packaged smoke OK: API booted inside AppImage"
    exit 0
  fi
  if ! kill -0 $PID 2>/dev/null; then
    echo "Packaged app exited before API boot. Log:"
    cat "$LOG" 2>/dev/null || echo "(no log)"
    exit 1
  fi
  sleep 1
done

echo "Timed out waiting for API boot. Log:"
cat "$LOG" 2>/dev/null || echo "(no log)"
exit 1
