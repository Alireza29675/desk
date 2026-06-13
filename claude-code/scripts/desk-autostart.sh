#!/usr/bin/env sh
# Desk plugin — SessionStart hook: ensure the desk viewer/server is running.
#
# Self-sufficient by design: it must NEVER block session startup and must NEVER
# error, regardless of how `desk start` behaves. So it health-checks first (fast
# no-op if the server is already up — which also avoids a duplicate-bind crash)
# and otherwise starts the server DETACHED, so the hook returns immediately even
# if `desk start` runs in the foreground.
#
# - Honors DESK_NO_AUTOSTART: set it to skip the AUTOMATIC start. A manual
#   `desk start` the user runs themselves is unaffected — only this hook checks it.
# - Silent (exit 0) if desk isn't on PATH yet, so a session never shows a hook
#   error just because the plugin loaded before the CLI was installed.

# Opt out of auto-start.
[ -n "$DESK_NO_AUTOSTART" ] && exit 0

# Nothing to start if the CLI isn't installed.
command -v desk >/dev/null 2>&1 || exit 0

DESK_URL="${DESK_URL:-http://127.0.0.1:7878}"

# Already running? Fast no-op (also avoids a second `desk start` colliding on the port).
if command -v curl >/dev/null 2>&1 && curl -fsS "$DESK_URL/health" >/dev/null 2>&1; then
  exit 0
fi

# Start it detached so the hook returns immediately, whether `desk start` is
# fast-exit (idempotent) or foreground-blocking. Output goes nowhere; a manual
# `desk start` is the way to see logs.
( desk start >/dev/null 2>&1 & ) </dev/null

exit 0
