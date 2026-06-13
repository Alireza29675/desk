#!/usr/bin/env sh
# desk — one-command onboarding for Claude Code.
#
# Lays down the runtime (Bun + the desk CLI) and wires desk into Claude Code:
# registers the marketplace, installs the plugin (both MCP surfaces), and drops a
# `desk-code` launcher for the research-preview comment loop. After this, launch
# Claude Code and your agent can render artifacts into a live local viewer.
#
# Usage:   curl -fsSL https://<host>/install.sh | sh
#
# Everything runs on your machine. No data leaves it.
#
# ── Overridable sources ──────────────────────────────────────────────────────
# The PUBLIC defaults below are gated on the maintainer publishing desk; until
# then (and for local/throwaway testing) point them at local artifacts:
#   DESK_PACKAGE_SOURCE      what `bun add -g` installs to get the desk + desk-channel
#                            bins. Default: the published package. Local test: a
#                            path to the packed tarball (eng1's bundle).
#   DESK_MARKETPLACE_SOURCE  what `claude plugin marketplace add` registers.
#                            Default: the GitHub repo. Local test: a path to a
#                            desk checkout containing .claude-plugin/marketplace.json.
set -eu

DESK_PACKAGE_SOURCE="${DESK_PACKAGE_SOURCE:-desk}"
DESK_MARKETPLACE_SOURCE="${DESK_MARKETPLACE_SOURCE:-Alireza29675/desk}"
MIN_CLAUDE_VERSION="2.1.80"   # channels (the comment loop) require this or newer

# ── output helpers (plain ASCII for portability) ─────────────────────────────
say()  { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
die()  { printf 'Error: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# version_ge A B  ->  exit 0 if dotted-numeric A >= B (portable; no sort -V dependency)
version_ge() {
  _a="$1"; _b="$2"
  IFS=. ; set -- $_a ; _a1="${1:-0}" ; _a2="${2:-0}" ; _a3="${3:-0}"
  set -- $_b ; _b1="${1:-0}" ; _b2="${2:-0}" ; _b3="${3:-0}"
  unset IFS
  [ "$_a1" -gt "$_b1" ] && return 0 ; [ "$_a1" -lt "$_b1" ] && return 1
  [ "$_a2" -gt "$_b2" ] && return 0 ; [ "$_a2" -lt "$_b2" ] && return 1
  [ "$_a3" -ge "$_b3" ]
}

# ── 1. Bun (the runtime desk needs) ──────────────────────────────────────────
ensure_bun() {
  step "Checking for Bun"
  if have bun; then
    say "Bun present: $(bun --version)"
    return 0
  fi
  say "Bun not found — installing from bun.sh..."
  curl -fsSL https://bun.sh/install | bash || die "Bun install failed. See https://bun.sh."
  # Make bun visible to the rest of this script run.
  BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  PATH="$BUN_INSTALL/bin:$PATH"
  export PATH
  have bun || die "Bun installed but not on PATH. Open a new shell and re-run, or add $BUN_INSTALL/bin to PATH."
  say "Bun installed: $(bun --version)"
}

# ── 2. Claude Code present + new enough ──────────────────────────────────────
ensure_claude() {
  step "Checking for Claude Code"
  have claude || die "Claude Code CLI not found. Install it from https://claude.com/claude-code, then re-run."
  _ver="$(claude --version 2>/dev/null | awk '{print $1}')"
  say "Claude Code present: ${_ver:-unknown}"
  if [ -n "${_ver:-}" ] && ! version_ge "$_ver" "$MIN_CLAUDE_VERSION"; then
    warn "Claude Code $_ver is older than $MIN_CLAUDE_VERSION."
    warn "The desk tools will still work, but the comment loop (desk-code) needs $MIN_CLAUDE_VERSION+."
    warn "Upgrade Claude Code to get the full experience."
  fi
}

# ── 3. The desk CLI (provides `desk` + `desk-channel` bins) ───────────────────
# SEAM (eng1's packaging): DESK_PACKAGE_SOURCE is the bun-global-installable
# bundle — published package or a local packed tarball. It must expose both bins.
install_desk() {
  step "Installing the desk CLI"
  bun add -g "$DESK_PACKAGE_SOURCE" || die "Failed to install desk from '$DESK_PACKAGE_SOURCE'."
  have desk         || die "desk installed but 'desk' is not on PATH. Add Bun's global bin dir to PATH and re-run."
  have desk-channel || warn "'desk-channel' not on PATH — the comment loop won't work until it is."
  say "desk CLI installed: $(desk --version 2>/dev/null || echo 'ok')"
}

# ── 4. Register the plugin with Claude Code (both MCP surfaces, one step) ─────
register_plugin() {
  step "Wiring desk into Claude Code"
  # marketplace add is idempotent enough — tolerate an already-registered marketplace.
  claude plugin marketplace add "$DESK_MARKETPLACE_SOURCE" 2>/dev/null \
    || claude plugin marketplace update desk 2>/dev/null \
    || warn "Could not add/update the desk marketplace from '$DESK_MARKETPLACE_SOURCE'."
  claude plugin install desk@desk || die "Plugin install failed (desk@desk)."
  say "Plugin installed: desk@desk"
}

# ── 5. The desk-code launcher (the honest comment-loop entrypoint) ───────────
# Co-located with the `desk` bin so it inherits the same PATH. It launches Claude
# Code with the research-preview flag the channel needs — nothing more.
install_launcher() {
  step "Installing the desk-code launcher"
  _bindir="$(dirname "$(command -v desk)")"
  _target="$_bindir/desk-code"
  cat > "$_target" <<'LAUNCHER'
#!/usr/bin/env sh
# Launch Claude Code with desk's comment loop enabled (research-preview channel).
exec claude --dangerously-load-development-channels plugin:desk@desk "$@"
LAUNCHER
  chmod +x "$_target"
  say "Installed: $_target"
}

# ── 6. First-run guidance (honest about what works where) ────────────────────
first_run_message() {
  cat <<'EOF'

==> desk is ready.

Two ways to use it from Claude Code:

  claude       The full loop, pull style. Your agent renders artifacts into a live
               viewer (http://127.0.0.1:7878); you comment on them there; ask the agent
               to "check the comments" and it reads them and revises. Run /mcp to see
               desk's tools.

  desk-code    Adds LIVE push: your comments arrive in the session automatically, the
               moment you leave them. Uses Claude Code's research-preview "channels"
               feature, so desk-code launches Claude Code with the flag it needs for you.

The viewer auto-starts in the background when you launch Claude Code, and is reused
if it's already running.
  - Manage it yourself:   desk start  /  desk status  /  desk stop
  - Don't want auto-start? Set DESK_NO_AUTOSTART=1 (a manual `desk start` still works).

Everything runs on your machine: one Bun process, a SQLite file under ~/.desk, no cloud.
EOF
}

main() {
  say "desk — Claude Code onboarding"
  ensure_bun
  ensure_claude
  install_desk
  register_plugin
  install_launcher
  first_run_message
}

main "$@"
