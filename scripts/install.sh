#!/usr/bin/env bash
# Compatibility entry point. The root install.sh is the canonical installer.
set -euo pipefail
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
    script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
    exec bash "$script_dir/../install.sh" "$@"
fi
curl -fsSL https://raw.githubusercontent.com/gstdcoin/gstdbot/main/install.sh | bash -s -- "$@"
