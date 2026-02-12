#!/usr/bin/env bash
# =============================================================================
# SiraBot v1 — One-Click Master Installer for Ubuntu VPS
# =============================================================================
#
# Comprehensive setup script that installs ALL dependencies, builds the
# project, verifies the DrissionPage bridge + Dynamic Scheduler, and
# triggers auto-onboarding.
#
# Usage:
#   bash setup-and-verify.sh              # Full install + build + verify + onboard
#   bash setup-and-verify.sh --test       # Skip installs, just run verification
#   bash setup-and-verify.sh --no-onboard # Full install but skip onboarding
#
# Supports: Ubuntu 20.04+ / Debian 11+
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'
BOLD='\033[1m'

# ─── Helpers ─────────────────────────────────────────────────────────────────
print_banner() {
  echo ""
  echo -e "${MAGENTA}${BOLD}"
  echo "  ╔═══════════════════════════════════════════════════════════════╗"
  echo "  ║                                                               ║"
  echo "  ║   ███████╗██╗██████╗  █████╗ ██████╗  ██████╗ ████████╗      ║"
  echo "  ║   ██╔════╝██║██╔══██╗██╔══██╗██╔══██╗██╔═══██╗╚══██╔══╝     ║"
  echo "  ║   ███████╗██║██████╔╝███████║██████╔╝██║   ██║   ██║        ║"
  echo "  ║   ╚════██║██║██╔══██╗██╔══██║██╔══██╗██║   ██║   ██║        ║"
  echo "  ║   ███████║██║██║  ██║██║  ██║██████╔╝╚██████╔╝   ██║        ║"
  echo "  ║   ╚══════╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝  ╚═════╝    ╚═╝        ║"
  echo "  ║                                                               ║"
  echo "  ║            One-Click VPS Master Installer                     ║"
  echo "  ╚═══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

print_header() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}  ${BOLD}$1${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

print_step() {
  echo -e "  ${BLUE}▸${NC} $1"
}

print_success() {
  echo -e "  ${GREEN}✓${NC} $1"
}

print_warning() {
  echo -e "  ${YELLOW}⚠${NC} $1"
}

print_error() {
  echo -e "  ${RED}✗${NC} $1"
}

SKIP_INSTALL=false
SKIP_ONBOARD=false

for arg in "$@"; do
  case "$arg" in
    --test) SKIP_INSTALL=true ;;
    --no-onboard) SKIP_ONBOARD=true ;;
  esac
done

print_banner

# =============================================================================
# STEP 1: System Update
# =============================================================================
if [ "$SKIP_INSTALL" = false ]; then
  print_header "Step 1/8: Updating System Packages"
  print_step "Running apt update..."
  sudo apt-get update -y -qq
  sudo apt-get upgrade -y -qq
  sudo apt-get install -y -qq curl wget gnupg ca-certificates lsb-release software-properties-common unzip
  print_success "System packages updated"
fi

# =============================================================================
# STEP 2: Install Node.js 22
# =============================================================================
print_header "Step 2/8: Node.js 22"

if command -v node &> /dev/null; then
  NODE_VERSION=$(node --version)
  NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 22 ]; then
    print_success "Node.js $NODE_VERSION already installed (>= 22 ✓)"
  else
    print_warning "Node.js $NODE_VERSION found but need >= 22. Upgrading..."
    if [ "$SKIP_INSTALL" = false ]; then
      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
      sudo apt-get install -y -qq nodejs
      print_success "Node.js $(node --version) installed"
    fi
  fi
else
  if [ "$SKIP_INSTALL" = false ]; then
    print_step "Installing Node.js 22 from NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y -qq nodejs
    print_success "Node.js $(node --version) installed"
  else
    print_error "Node.js not found. Run without --test to install."
    exit 1
  fi
fi

# =============================================================================
# STEP 3: Install Python 3 & pip
# =============================================================================
print_header "Step 3/8: Python 3 & pip"

if command -v python3 &> /dev/null; then
  PY_VERSION=$(python3 --version 2>&1)
  print_success "$PY_VERSION already installed"
else
  if [ "$SKIP_INSTALL" = false ]; then
    print_step "Installing Python 3..."
    sudo apt-get install -y -qq python3 python3-pip python3-venv
    print_success "$(python3 --version) installed"
  else
    print_error "Python 3 not found."
    exit 1
  fi
fi

# Ensure pip is available
if ! command -v pip3 &> /dev/null; then
  if [ "$SKIP_INSTALL" = false ]; then
    print_step "Installing pip3..."
    sudo apt-get install -y -qq python3-pip
    print_success "pip3 installed"
  fi
fi

# =============================================================================
# STEP 4: Install Google Chrome Stable
# =============================================================================
print_header "Step 4/8: Google Chrome (for DrissionPage)"

if command -v google-chrome &> /dev/null || command -v google-chrome-stable &> /dev/null; then
  CHROME_VERSION=$(google-chrome --version 2>/dev/null || google-chrome-stable --version 2>/dev/null)
  print_success "$CHROME_VERSION already installed"
else
  if [ "$SKIP_INSTALL" = false ]; then
    print_step "Downloading Google Chrome Stable..."
    wget -q -O /tmp/google-chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
    print_step "Installing Google Chrome..."
    sudo dpkg -i /tmp/google-chrome.deb 2>/dev/null || sudo apt-get install -f -y -qq
    rm -f /tmp/google-chrome.deb
    CHROME_VERSION=$(google-chrome --version 2>/dev/null || google-chrome-stable --version 2>/dev/null || echo "installed")
    print_success "Google Chrome $CHROME_VERSION installed"
  else
    print_warning "Google Chrome not found (needed for DrissionPage)"
  fi
fi

# =============================================================================
# STEP 5: Install pnpm
# =============================================================================
print_header "Step 5/8: pnpm Package Manager"

if command -v pnpm &> /dev/null; then
  PNPM_VERSION=$(pnpm --version)
  print_success "pnpm $PNPM_VERSION already installed"
else
  if [ "$SKIP_INSTALL" = false ]; then
    print_step "Installing pnpm@10.23.0 globally..."
    npm install -g pnpm@10.23.0
    print_success "pnpm $(pnpm --version) installed"
  else
    print_error "pnpm not found."
    exit 1
  fi
fi

# =============================================================================
# STEP 6: Install Dependencies
# =============================================================================
print_header "Step 6/8: Project Dependencies"

if [ "$SKIP_INSTALL" = false ]; then
  print_step "Installing Node.js dependencies (pnpm install)..."
  pnpm install --no-frozen-lockfile 2>&1 | tail -5
  print_success "Node.js dependencies installed"

  echo ""

  print_step "Installing DrissionPage (Python)..."
  pip3 install DrissionPage --break-system-packages 2>&1 | tail -3
  print_success "DrissionPage Python package installed"
else
  print_step "Skipping install (--test mode)"
fi

# =============================================================================
# STEP 7: Build & Verify
# =============================================================================
print_header "Step 7/8: Build & Verification"

if [ "$SKIP_INSTALL" = false ]; then
  print_step "Building project (pnpm build)..."
  pnpm build 2>&1 | tail -5
  print_success "Project built successfully"
  echo ""
fi

# ── Verify file structure ──
print_step "Verifying DrissionPage engine files..."
FILES_OK=true
check_file() {
  if [ -f "$1" ]; then
    print_success "  $1"
  else
    print_error "  MISSING: $1"
    FILES_OK=false
  fi
}

# DrissionPage Engine
check_file "src/browser/drission/types.ts"
check_file "src/browser/drission/bridge-client.ts"
check_file "src/browser/drission/engine.ts"
check_file "src/browser/drission/vision.ts"
check_file "src/browser/drission/captcha-config.ts"
check_file "src/browser/drission/drission_bridge.py"
check_file "src/browser/drission/stealth_helpers.py"
check_file "src/browser/drission/index.ts"

echo ""
print_step "Verifying Dynamic Scheduler files..."

# Scheduler
check_file "src/scheduler/types.ts"
check_file "src/scheduler/scheduler-store.ts"
check_file "src/scheduler/scheduler-runner.ts"
check_file "src/scheduler/scheduler-tool.ts"
check_file "src/scheduler/index.ts"

echo ""
print_step "Verifying config integration..."
check_file "src/config/types.browser.ts"
check_file "src/agents/system-prompt.ts"

if [ "$FILES_OK" = false ]; then
  print_error "Some files are missing! Check the output above."
  exit 1
fi
print_success "All files verified ✓"

echo ""

# ── Verify Python bridge ──
print_step "Verifying DrissionPage Python bridge..."
PYTHON_CHECK=$(python3 -c "
try:
    from DrissionPage import ChromiumPage, ChromiumOptions
    print('OK')
except ImportError:
    print('MISSING')
" 2>/dev/null || echo "ERROR")

if [ "$PYTHON_CHECK" = "OK" ]; then
  print_success "DrissionPage Python package verified ✓"
elif [ "$PYTHON_CHECK" = "MISSING" ]; then
  print_warning "DrissionPage not installed. Run: pip3 install DrissionPage --break-system-packages"
else
  print_warning "Python check failed (Python 3 may not be installed)"
fi

# ── Verify stealth helpers ──
print_step "Verifying stealth_helpers.py module..."
STEALTH_CHECK=$(python3 -c "
import sys
sys.path.insert(0, 'src/browser/drission')
from stealth_helpers import random_delay, bezier_curve_points, add_human_noise_to_coords
pts = bezier_curve_points((0,0), (100,100), 5)
print(f'OK:{len(pts)}')
" 2>/dev/null || echo "ERROR")

if [[ "$STEALTH_CHECK" == OK:* ]]; then
  print_success "stealth_helpers.py verified ✓ (Bézier points: ${STEALTH_CHECK#OK:})"
else
  print_warning "stealth_helpers.py check failed"
fi

# ── Run existing tests if vitest available ──
echo ""
if command -v pnpm &> /dev/null && [ -f "node_modules/.bin/vitest" ]; then
  print_step "Running custom model schema tests..."
  pnpm vitest run src/config/config.custom-models.test.ts 2>&1 | tail -8 || true
  echo ""

  print_step "Running custom model validator tests..."
  pnpm vitest run src/config/custom-model-validate.test.ts 2>&1 | tail -8 || true
  echo ""

  print_step "Running model-alias-defaults tests (regression)..."
  pnpm vitest run src/config/model-alias-defaults.test.ts 2>&1 | tail -8 || true
  echo ""
else
  print_warning "Vitest not available — skipping unit tests (will work after build)"
fi

# =============================================================================
# STEP 8: Auto-Onboarding
# =============================================================================
print_header "Step 8/8: Auto-Onboarding"

if [ "$SKIP_ONBOARD" = true ]; then
  print_step "Skipping onboarding (--no-onboard flag)"
else
  if [ -f "openclaw.mjs" ]; then
    print_step "Starting onboarding wizard..."
    echo ""
    node openclaw.mjs onboard
  else
    print_warning "openclaw.mjs not found — skipping onboarding"
    print_step "You can run onboarding manually later: node openclaw.mjs onboard"
  fi
fi

# =============================================================================
# DONE
# =============================================================================
print_header "🎉 Setup Complete!"

echo -e "  ${GREEN}${BOLD}SiraBot is ready to go!${NC}"
echo ""
echo -e "  ${CYAN}Quick Reference:${NC}"
echo -e "  ─────────────────────────────────────────────"
echo -e "  ${BOLD}Start the bot:${NC}          node openclaw.mjs"
echo -e "  ${BOLD}Start (dev mode):${NC}       pnpm dev"
echo -e "  ${BOLD}Start gateway:${NC}          pnpm gateway:dev"
echo -e "  ${BOLD}Run tests:${NC}              pnpm test"
echo -e "  ${BOLD}Re-run onboarding:${NC}      node openclaw.mjs onboard"
echo ""
echo -e "  ${CYAN}DrissionPage (Stealth Browser):${NC}"
echo -e "  ─────────────────────────────────────────────"
echo -e "  Set ${BOLD}driver: \"drission\"${NC} in your browser config"
echo -e "  Configure stealth in ${BOLD}config.json → browser.drission${NC}"
echo ""
echo -e "  ${CYAN}Dynamic Scheduler:${NC}"
echo -e "  ─────────────────────────────────────────────"
echo -e "  Ask the agent: ${BOLD}\"Monitor this site every morning at 9 AM\"${NC}"
echo -e "  Tasks saved to: ${BOLD}data/scheduled_tasks.json${NC}"
echo ""
echo -e "  ${CYAN}Keep Running in Background:${NC}"
echo -e "  ─────────────────────────────────────────────"
echo -e "  ${BOLD}npm install -g pm2${NC}"
echo -e "  ${BOLD}pm2 start node --name sirabot -- openclaw.mjs${NC}"
echo -e "  ${BOLD}pm2 save && pm2 startup${NC}"
echo ""
