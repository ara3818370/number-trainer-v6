#!/bin/bash
set -euo pipefail
echo "=== PHASE 2b: TAILSCALE VERIFY $(date -u) ==="

echo "[1/2] Verifying Tailscale..."
tailscale status
TS_IP=$(tailscale ip -4 2>/dev/null || echo "NOT SET")
echo "VERIFY Tailscale IP: $TS_IP"

echo "[2/2] Disabling mDNS..."
if command -v systemctl &>/dev/null; then
  systemctl disable --now avahi-daemon 2>/dev/null && echo "avahi-daemon disabled" || echo "avahi-daemon not installed (OK)"
fi

echo ""
echo "============================================"
echo "  PHASE 2 COMPLETE"
echo "  Tailscale IP: $TS_IP"
echo "============================================"
echo ""
echo "NEXT: Ask operator to lock GCP firewall:"
echo "  gcloud compute firewall-rules update allow-ssh --source-ranges=$TS_IP/32"
