#!/usr/bin/env bash
# =============================================================================
# OpenClaw Custom Model Configuration — One-Click Setup & Verify Script
# =============================================================================
# 
# This script installs dependencies, runs all tests, and verifies the custom
# model configuration feature is working correctly.
#
# Usage:
#   bash setup-and-verify.sh          # Full setup + test
#   bash setup-and-verify.sh --test   # Skip install, just run tests
#
# Requirements: Node.js >= 22.12.0, pnpm (will be installed if missing)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

print_header() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}  ${BOLD}$1${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
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

# ─────────────────────────────────────────────────────────────────────────────
# Step 1: Check Node.js
# ─────────────────────────────────────────────────────────────────────────────
print_header "Step 1: Checking Node.js"

if ! command -v node &> /dev/null; then
  print_error "Node.js is not installed. Please install Node.js >= 22.12.0"
  print_step "Download from: https://nodejs.org/"
  exit 1
fi

NODE_VERSION=$(node --version)
print_success "Node.js $NODE_VERSION found"

# Check minimum version (22.12.0)
NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 22 ]; then
  print_error "Node.js >= 22.12.0 required, found $NODE_VERSION"
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 2: Check/Install pnpm
# ─────────────────────────────────────────────────────────────────────────────
print_header "Step 2: Checking pnpm"

if ! command -v pnpm &> /dev/null; then
  print_warning "pnpm not found, installing..."
  npm install -g pnpm@10.23.0
fi

PNPM_VERSION=$(pnpm --version)
print_success "pnpm $PNPM_VERSION found"

# ─────────────────────────────────────────────────────────────────────────────
# Step 3: Install dependencies
# ─────────────────────────────────────────────────────────────────────────────
if [ "${1:-}" != "--test" ]; then
  print_header "Step 3: Installing dependencies"
  print_step "Running pnpm install..."
  pnpm install --no-frozen-lockfile 2>&1 | tail -5
  print_success "Dependencies installed"
else
  print_header "Step 3: Skipping install (--test flag)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 4: Verify custom model files exist
# ─────────────────────────────────────────────────────────────────────────────
print_header "Step 4: Verifying custom model files"

FILES_OK=true
check_file() {
  if [ -f "$1" ]; then
    print_success "$1"
  else
    print_error "MISSING: $1"
    FILES_OK=false
  fi
}

check_file "src/config/types.models.ts"
check_file "src/config/zod-schema.core.ts"
check_file "src/config/validation.ts"
check_file "src/config/custom-model-validate.ts"
check_file "src/config/config.custom-models.test.ts"
check_file "src/config/custom-model-validate.test.ts"

if [ "$FILES_OK" = false ]; then
  print_error "Some files are missing!"
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 5: Run tests
# ─────────────────────────────────────────────────────────────────────────────
print_header "Step 5: Running test suite"

print_step "Running custom model schema tests..."
pnpm vitest run src/config/config.custom-models.test.ts 2>&1 | tail -8
echo ""

print_step "Running custom model validator tests..."
pnpm vitest run src/config/custom-model-validate.test.ts 2>&1 | tail -8
echo ""

print_step "Running existing model-alias-defaults tests (regression)..."
pnpm vitest run src/config/model-alias-defaults.test.ts 2>&1 | tail -8
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Step 6: Summary
# ─────────────────────────────────────────────────────────────────────────────
print_header "All Done!"

echo -e "  ${GREEN}${BOLD}Custom model configuration is ready!${NC}"
echo ""
echo -e "  Add this to your OpenClaw config to connect a custom model:"
echo ""
echo -e "  ${CYAN}{${NC}"
echo -e "  ${CYAN}  \"models\": {${NC}"
echo -e "  ${CYAN}    \"customModels\": {${NC}"
echo -e "  ${CYAN}      \"my-local-llm\": {${NC}"
echo -e "  ${CYAN}        \"name\": \"Local LLM\",${NC}"
echo -e "  ${CYAN}        \"endpointUrl\": \"http://localhost:11434/v1\"${NC}"
echo -e "  ${CYAN}      }${NC}"
echo -e "  ${CYAN}    }${NC}"
echo -e "  ${CYAN}  }${NC}"
echo -e "  ${CYAN}}${NC}"
echo ""
