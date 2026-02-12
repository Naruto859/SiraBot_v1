# =============================================================================
# OpenClaw Custom Model Configuration — One-Click Setup & Verify (Windows)
# =============================================================================
#
# Usage:
#   .\setup-and-verify.ps1           # Full setup + test
#   .\setup-and-verify.ps1 -TestOnly # Skip install, just run tests
#
# Requirements: Node.js >= 22.12.0
# =============================================================================

param([switch]$TestOnly)

$ErrorActionPreference = "Stop"

function Write-Header($msg) {
    Write-Host ""
    Write-Host "  ======================================================" -ForegroundColor Cyan
    Write-Host "   $msg" -ForegroundColor White
    Write-Host "  ======================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step($msg) { Write-Host "  > $msg" -ForegroundColor Blue }
function Write-Ok($msg)   { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "  ✗ $msg" -ForegroundColor Red }

# ── Step 1: Check Node.js ────────────────────────────────────────────────────
Write-Header "Step 1: Checking Node.js"

try {
    $nodeVersion = node --version
    Write-Ok "Node.js $nodeVersion found"
    $major = [int]($nodeVersion -replace 'v','').Split('.')[0]
    if ($major -lt 22) {
        Write-Fail "Node.js >= 22.12.0 required, found $nodeVersion"
        exit 1
    }
} catch {
    Write-Fail "Node.js is not installed. Please install Node.js >= 22.12.0"
    Write-Step "Download from: https://nodejs.org/"
    exit 1
}

# ── Step 2: Check/Install pnpm ───────────────────────────────────────────────
Write-Header "Step 2: Checking pnpm"

try {
    $pnpmVersion = pnpm --version
    Write-Ok "pnpm $pnpmVersion found"
} catch {
    Write-Warn "pnpm not found, installing..."
    npm install -g pnpm@10.23.0
    $pnpmVersion = pnpm --version
    Write-Ok "pnpm $pnpmVersion installed"
}

# ── Step 3: Install dependencies ─────────────────────────────────────────────
if (-not $TestOnly) {
    Write-Header "Step 3: Installing dependencies"
    Write-Step "Running pnpm install..."
    pnpm install --no-frozen-lockfile
    Write-Ok "Dependencies installed"
} else {
    Write-Header "Step 3: Skipping install (-TestOnly flag)"
}

# ── Step 4: Verify custom model files ────────────────────────────────────────
Write-Header "Step 4: Verifying custom model files"

$allOk = $true
$files = @(
    "src/config/types.models.ts",
    "src/config/zod-schema.core.ts",
    "src/config/validation.ts",
    "src/config/custom-model-validate.ts",
    "src/config/config.custom-models.test.ts",
    "src/config/custom-model-validate.test.ts"
)

foreach ($f in $files) {
    if (Test-Path $f) {
        Write-Ok $f
    } else {
        Write-Fail "MISSING: $f"
        $allOk = $false
    }
}

if (-not $allOk) {
    Write-Fail "Some files are missing!"
    exit 1
}

# ── Step 5: Run tests ────────────────────────────────────────────────────────
Write-Header "Step 5: Running test suite"

Write-Step "Running all custom model tests + regression tests..."
pnpm vitest run `
    src/config/config.custom-models.test.ts `
    src/config/custom-model-validate.test.ts `
    src/config/model-alias-defaults.test.ts

if ($LASTEXITCODE -ne 0) {
    Write-Fail "Tests failed!"
    exit 1
}

# ── Step 6: Summary ──────────────────────────────────────────────────────────
Write-Header "All Done!"

Write-Host "  Custom model configuration is ready!" -ForegroundColor Green
Write-Host ""
Write-Host "  Add this to your OpenClaw config:" -ForegroundColor White
Write-Host ""
Write-Host '  {' -ForegroundColor Cyan
Write-Host '    "models": {' -ForegroundColor Cyan
Write-Host '      "customModels": {' -ForegroundColor Cyan
Write-Host '        "my-local-llm": {' -ForegroundColor Cyan
Write-Host '          "name": "Local LLM",' -ForegroundColor Cyan
Write-Host '          "endpointUrl": "http://localhost:11434/v1"' -ForegroundColor Cyan
Write-Host '        }' -ForegroundColor Cyan
Write-Host '      }' -ForegroundColor Cyan
Write-Host '    }' -ForegroundColor Cyan
Write-Host '  }' -ForegroundColor Cyan
Write-Host ""
