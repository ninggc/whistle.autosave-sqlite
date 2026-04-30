#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$PWD"
if [[ -n "${BASH_SOURCE[0]:-}" && "${BASH_SOURCE[0]}" != "bash" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

WHISTLE_PLUGIN_NAME="whistle.autosave-sqlite"
PLUGIN_TGZ_URL="https://oss-fx-int.nioint.com/fx/pdd-platform-front/__cdn__/public/whistle.autosave-sqlite-0.1.0.tgz"
ZEROOMEGA_CRX_URL="https://oss-fx-int.nioint.com/fx/pdd-platform-front/__cdn__/public/zeroomega-3.4.5.crx"
ZEROOMEGA_BACKUP_URL="https://oss-fx-int.nioint.com/fx/pdd-platform-front/__cdn__/public/ZeroOmegaOptions-2026-04-30T08_16_39.687Z.bak"
DB_PATH=""
NODE_MIN_MAJOR=18
NODE_MAX_MAJOR=20

CACHE_ROOT="${XDG_CACHE_HOME:-$HOME/.cache}/whistle-autosave-sqlite"
ZEROOMEGA_ROOT="$CACHE_ROOT/zeroomega"
ZEROOMEGA_CRX_PATH="$ZEROOMEGA_ROOT/zeroomega.crx"
ZEROOMEGA_ZIP_PATH="$ZEROOMEGA_ROOT/zeroomega.zip"
ZEROOMEGA_EXT_DIR="$ZEROOMEGA_ROOT/extension"
ZEROOMEGA_PROFILE_DIR="$ZEROOMEGA_ROOT/chrome-profile"
PLAYWRIGHT_ROOT="$CACHE_ROOT/playwright"
PLAYWRIGHT_PKG_DIR="$PLAYWRIGHT_ROOT/pkg"
LAUNCHER_PATH="$CACHE_ROOT/run-zeroomega-chrome.sh"

CHROME_CANDIDATES=(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
)

log() {
  printf '[setup-all] %s\n' "$*"
}

usage() {
  cat <<'EOF'
Usage:
  bash setup-all.sh [--db /path/to/data.sqlite]

Options:
  --db PATH    SQLite database path to prepare for the plugin
  -h, --help   Show this help
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --db)
        [[ $# -ge 2 ]] || {
          echo "Missing value for --db" >&2
          exit 1
        }
        DB_PATH="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown argument: $1" >&2
        usage >&2
        exit 1
        ;;
    esac
  done
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

ensure_homebrew() {
  if command -v brew >/dev/null 2>&1; then
    return 0
  fi

  log "Homebrew is required to auto-install Node.js, but brew was not found"
  cat >&2 <<'EOF'
Please install Homebrew first, then rerun this script:
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
EOF
  exit 1
}

prepend_node20_path() {
  local candidates=(
    "/opt/homebrew/opt/node@20/bin"
    "/usr/local/opt/node@20/bin"
  )
  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -x "$candidate/node" && -x "$candidate/npm" ]]; then
      export PATH="$candidate:$PATH"
      return 0
    fi
  done
  return 1
}

node_major_version() {
  node -p 'process.versions.node.split(".")[0]'
}

ensure_node_runtime() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    local major
    major="$(node_major_version)"
    if (( major >= NODE_MIN_MAJOR && major <= NODE_MAX_MAJOR )); then
      return 0
    fi

    log "Detected Node.js v$major; sqlite3 installs are more reliable on Node.js 18-20"
  fi

  ensure_homebrew
  log "Installing Node.js 20 via Homebrew"
  brew install node@20
  prepend_node20_path || true

  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    cat >&2 <<'EOF'
Node.js was installed, but the current shell still cannot find `node` or `npm`.
Try running one of these commands, then rerun the script:
  eval "$(/opt/homebrew/bin/brew shellenv)"
  eval "$(/usr/local/bin/brew shellenv)"
EOF
    exit 1
  fi

  local major
  major="$(node_major_version)"
  if (( major < NODE_MIN_MAJOR || major > NODE_MAX_MAJOR )); then
    cat >&2 <<'EOF'
This script needs Node.js 18-20 for the current sqlite3 dependency.
Please ensure `node@20` is ahead of other Node installations in PATH, then rerun.
EOF
    exit 1
  fi

  log "Using Node.js $(node -v) and npm $(npm -v)"
}

detect_browser() {
  local candidate
  for candidate in "${CHROME_CANDIDATES[@]}"; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  printf 'Could not find Chrome or Edge in /Applications.\n' >&2
  exit 1
}

ensure_whistle() {
  if ! command -v w2 >/dev/null 2>&1; then
    log "Installing whistle"
    npm i -g whistle
  else
    log "whistle is already installed: $(w2 -V)"
  fi
}

install_plugin() {
  log "Installing plugin from tgz"
  npm i -g "$PLUGIN_TGZ_URL"
}

start_or_restart_whistle() {
  local status_output
  status_output="$(w2 status 2>/dev/null || true)"
  if printf '%s' "$status_output" | grep -Eqi 'running|started|port'; then
    log "Restarting whistle so the plugin is reloaded"
    w2 restart
  else
    log "Starting whistle"
    w2 start
  fi
}

prepare_db_path() {
  [[ -n "$DB_PATH" ]] || return 0

  mkdir -p "$(dirname "$DB_PATH")"
  log "Prepared SQLite directory for: $DB_PATH"
}

prepare_zeroomega_extension() {
  mkdir -p "$ZEROOMEGA_ROOT"

  log "Downloading ZeroOmega CRX"
  curl -fsSL "$ZEROOMEGA_CRX_URL" -o "$ZEROOMEGA_CRX_PATH"

  log "Unpacking ZeroOmega"
  python3 - "$ZEROOMEGA_CRX_PATH" "$ZEROOMEGA_ZIP_PATH" <<'PY'
import struct
import sys

src, dst = sys.argv[1], sys.argv[2]
with open(src, "rb") as f:
    magic = f.read(4)
    if magic != b"Cr24":
        raise SystemExit("invalid CRX header")
    version = struct.unpack("<I", f.read(4))[0]
    if version == 3:
        header_len = 12 + struct.unpack("<I", f.read(4))[0]
    elif version == 2:
        pub_len, sig_len = struct.unpack("<II", f.read(8))
        header_len = 16 + pub_len + sig_len
    else:
        raise SystemExit(f"unsupported CRX version: {version}")

with open(src, "rb") as f:
    f.seek(header_len)
    data = f.read()

with open(dst, "wb") as f:
    f.write(data)
PY

  rm -rf "$ZEROOMEGA_EXT_DIR"
  mkdir -p "$ZEROOMEGA_EXT_DIR"
  unzip -oq "$ZEROOMEGA_ZIP_PATH" -d "$ZEROOMEGA_EXT_DIR"
}

ensure_playwright() {
  mkdir -p "$PLAYWRIGHT_ROOT"
  if [[ ! -f "$PLAYWRIGHT_PKG_DIR/node_modules/playwright/package.json" ]]; then
    log "Installing Playwright runtime for one-time browser automation"
    npm install --prefix "$PLAYWRIGHT_PKG_DIR" --no-save playwright@1.54.2
  else
    log "Playwright runtime already prepared"
  fi
}

create_launcher() {
  local browser_bin="$1"
  cat >"$LAUNCHER_PATH" <<EOF
#!/usr/bin/env bash
set -euo pipefail

ZEROOMEGA_EXT_DIR="$ZEROOMEGA_EXT_DIR"
ZEROOMEGA_PROFILE_DIR="$ZEROOMEGA_PROFILE_DIR"
BROWSER_BIN="\${BROWSER_BIN:-$browser_bin}"

exec "\$BROWSER_BIN" \
  --user-data-dir="\$ZEROOMEGA_PROFILE_DIR" \
  --disable-extensions-except="\$ZEROOMEGA_EXT_DIR" \
  --load-extension="\$ZEROOMEGA_EXT_DIR" \
  --no-first-run \
  --no-default-browser-check \
  "http://127.0.0.1:8899"
EOF
  chmod +x "$LAUNCHER_PATH"
}

import_zeroomega_backup() {
  local browser_bin="$1"
  local node_script

  mkdir -p "$ZEROOMEGA_PROFILE_DIR"
  node_script="$(mktemp "$ZEROOMEGA_ROOT/import-zeroomega-XXXXXX.cjs")"

  cat >"$node_script" <<'EOF'
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const browserBin = process.env.BROWSER_BIN;
  const extensionDir = process.env.ZEROOMEGA_EXT_DIR;
  const profileDir = process.env.ZEROOMEGA_PROFILE_DIR;
  const backupUrl = process.env.ZEROOMEGA_BACKUP_URL;
  const playwrightPkgDir = process.env.PLAYWRIGHT_PKG_DIR;

  const { chromium } = require(path.join(playwrightPkgDir, 'node_modules/playwright'));
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: browserBin,
    headless: false,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  try {
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 20000 });
    }

    const extensionId = new URL(serviceWorker.url()).host;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html#!/io`, {
      waitUntil: 'domcontentloaded',
    });

    const restoreInput = page.locator('input[type="url"]').first();
    await restoreInput.waitFor({ timeout: 20000 });
    await restoreInput.fill(backupUrl);

    const restoreButton = page.locator('div.input-group.width-limit button').first();
    await restoreButton.click();

    const applyLink = page.locator('a[ng-click="applyOptions()"]').first();
    try {
      await applyLink.waitFor({ state: 'visible', timeout: 15000 });
      await applyLink.click();
    } catch (error) {
      // Some backups apply immediately and never show the top-level apply action.
    }

    const confirmButton = page.locator('.modal-footer .btn-primary').first();
    try {
      await confirmButton.waitFor({ state: 'visible', timeout: 5000 });
      await confirmButton.click();
    } catch (error) {
      // No confirmation dialog was needed.
    }

    await page.waitForTimeout(3000);

    const whistlePage = await context.newPage();
    await whistlePage.goto('http://127.0.0.1:8899', { waitUntil: 'domcontentloaded' });
    await whistlePage.waitForTimeout(1000);
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
EOF

  log "Launching browser once to import ZeroOmega backup"
  BROWSER_BIN="$browser_bin" \
  ZEROOMEGA_EXT_DIR="$ZEROOMEGA_EXT_DIR" \
  ZEROOMEGA_PROFILE_DIR="$ZEROOMEGA_PROFILE_DIR" \
  ZEROOMEGA_BACKUP_URL="$ZEROOMEGA_BACKUP_URL" \
  PLAYWRIGHT_PKG_DIR="$PLAYWRIGHT_PKG_DIR" \
  node "$node_script"

  rm -f "$node_script"
}

main() {
  parse_args "$@"

  require_cmd bash
  require_cmd curl
  require_cmd python3
  require_cmd grep
  require_cmd unzip

  ensure_node_runtime

  local browser_bin
  browser_bin="$(detect_browser)"

  mkdir -p "$CACHE_ROOT"

  log "Using browser: $browser_bin"
  ensure_whistle
  install_plugin
  start_or_restart_whistle
  prepare_db_path
  prepare_zeroomega_extension
  ensure_playwright
  create_launcher "$browser_bin"
  import_zeroomega_backup "$browser_bin"

  cat <<EOF

Setup complete.

- whistle is running at: http://127.0.0.1:8899
- ZeroOmega managed profile: $ZEROOMEGA_PROFILE_DIR
- ZeroOmega launcher: $LAUNCHER_PATH
- SQLite path prepared: ${DB_PATH:-not provided}

Next time, start the managed browser with:
  $LAUNCHER_PATH
EOF
}

main "$@"
