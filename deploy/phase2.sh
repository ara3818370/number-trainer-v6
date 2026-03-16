#!/bin/bash
set -euo pipefail
echo "=== PHASE 2: TAILSCALE VPN $(date -u) ==="

echo "[1/3] Installing Tailscale via apt repo..."
curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.noarmor.gpg | tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.tailscale-keyring.list | tee /etc/apt/sources.list.d/tailscale.list >/dev/null
apt-get update -qq
apt-get install -y -qq tailscale
echo "VERIFY install: $(tailscale --version 2>&1 | head -1)"

echo "[2/3] Starting Tailscale..."
echo ""
echo "============================================"
echo "  ACTION REQUIRED: Authorize Tailscale"
echo "============================================"
echo "  Open the URL below in your browser"
echo "  and log in to your Tailscale account:"
echo ""
tailscale up --ssh 2>&1 || true
echo ""
echo "============================================"
echo "  After authorizing, run Phase 2b script"
echo "  to verify and lock down SSH"
echo "============================================"
