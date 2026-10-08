#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

usage() {
  cat <<'EOF'
Build Summit Sentinel with EAS.

Usage:
  ./build.sh <ios|android> [development|development-simulator|preview|production]

Examples:
  ./build.sh ios development
  ./build.sh ios development-simulator
  ./build.sh android preview
  ./build.sh android production

The default profile is development. iOS development builds require an Apple
Developer account for a physical device; development-simulator targets Simulator.
BLE requires a development/standalone build, not Expo Go.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

platform="${1:-}"
profile="${2:-development}"

if [[ "$platform" != "ios" && "$platform" != "android" ]]; then
  usage >&2
  exit 2
fi

case "$profile" in
  development|development-simulator|preview|production) ;;
  *)
    echo "Unknown EAS profile: $profile" >&2
    usage >&2
    exit 2
    ;;
esac

if [[ "$profile" == "development-simulator" && "$platform" != "ios" ]]; then
  echo "The development-simulator profile is for iOS only." >&2
  exit 2
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js 22.13+ and npm are required. Install Node.js, reopen your terminal, and retry." >&2
  exit 1
fi

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)'; then
  echo "Expo SDK 57 requires Node.js 22.13 or newer; found $(node --version)." >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Installing project dependencies..."
  npm install
fi

echo "Running TypeScript check..."
npm run typecheck

echo "Starting EAS build: platform=$platform profile=$profile"
npx --yes eas-cli@latest build --platform "$platform" --profile "$profile"
