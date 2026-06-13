#!/usr/bin/env sh
# Desk plugin — SessionStart hook.
# Ensures the desk background server is running so the `desk` MCP tools connect.
#
# Contract this relies on (eng1's lane): `desk start` is idempotent and fast —
# it health-checks 127.0.0.1:7878, spawns the server detached if absent, returns
# only once /health is 200, and is a quick no-op if the server is already up.
# That is why it is safe to call on every session start.
#
# Notes:
# - Honors DESK_NO_AUTOSTART: set it to skip the AUTOMATIC start. A manual
#   `desk start` the user runs themselves is unaffected — only this hook checks it.
# - Stays silent (exit 0) if desk isn't on PATH yet, so a session never shows a
#   hook error just because the plugin loaded before the CLI was installed.
set -e

# Opt out of auto-start.
[ -n "$DESK_NO_AUTOSTART" ] && exit 0

# Nothing to start if the CLI isn't installed.
command -v desk >/dev/null 2>&1 || exit 0

exec desk start
