#!/usr/bin/env bash
# One independent compute node per Linux host. No shared keys or pooled RAM.
set -euo pipefail
hosts_file=""; wallet=""; model="auto"; plan=false; failed=0
while [ "$#" -gt 0 ]; do
 case "$1" in
  --hosts) hosts_file="${2:?hosts file required}";shift 2;;
  --wallet) wallet="${2:?public wallet required}";shift 2;;
  --model) model="${2:?model required}";shift 2;;
  --plan) plan=true;shift;;
  --help) echo 'Usage: bash install-cluster.sh --hosts hosts.txt --wallet PUBLIC_TON_ADDRESS [--model auto|none|family:tag] [--plan]';exit 0;;
  *) echo "Unknown option: $1" >&2;exit 2;;
 esac
done
[ -r "$hosts_file" ] || { echo 'Readable --hosts inventory required' >&2;exit 2; }
[[ "$wallet" =~ ^((EQ|UQ)[A-Za-z0-9_-]{46}|0:[a-fA-F0-9]{64})$ ]] || { echo 'Public TON address required; never use a private key' >&2;exit 2; }
[[ "$model" =~ ^[a-zA-Z0-9:._/-]+$ && "$model" != *cloud* ]] || { echo 'Invalid local model' >&2;exit 2; }
# Validate the entire inventory before connecting to any host.
hosts=()
while IFS= read -r line || [ -n "$line" ]; do
 line="${line%%#*}";line="${line//$'\r'/}"
 [ -z "${line//[[:space:]]/}" ] && continue
 [[ "$line" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.@-]*$ ]] || { echo 'Invalid SSH host in inventory' >&2;exit 2; }
 hosts+=("$line")
done < "$hosts_file"
[ "${#hosts[@]}" -gt 0 ] || { echo 'Inventory is empty' >&2;exit 2; }
[ "${#hosts[@]}" -le 10 ] || { echo 'Current platform limit: 10 live identities per registration wallet. Request a capacity review before a larger deployment.' >&2;exit 2; }
echo "Independent nodes: ${#hosts[@]}. SSH credentials and known-host entries must already exist."
echo 'No passwords or keys are copied. Existing node identities and balances are preserved.'
echo 'Public paid inference requires a reachable HTTPS endpoint per node; this installer does not create tunnels.'
for target in "${hosts[@]}"; do
 echo "Host: $target; starter model: $model"
 $plan && continue
 if ! ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "$target" bash -s -- "$wallet" "$model" <<'REMOTE'
set -euo pipefail
export GSTD_WALLET_ADDRESS="$1" GSTD_STARTER_MODEL="$2"
script=$(mktemp)
trap 'rm -f "$script"' EXIT
curl -fsSL https://raw.githubusercontent.com/gstdcoin/gstdbot/main/install.sh -o "$script"
bash "$script" --check
bash "$script"
REMOTE
 then echo "Installation failed on $target" >&2;failed=$((failed+1));fi
done
[ "$failed" -eq 0 ] || { echo "Failed hosts: $failed" >&2;exit 1; }
