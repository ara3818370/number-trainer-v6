#!/bin/bash
set -euo pipefail
echo "=== PHASE 3: NODE.JS + OPENCLAW $(date -u) ==="

echo "[1/5] Switching to openclaw user context..."
export HOME=/home/openclaw
cd /home/openclaw

echo "[2/5] Installing nvm..."
# Download nvm installer for checksum verification
su - openclaw -c '
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh -o /tmp/nvm-install.sh
  echo "Checksum: $(sha256sum /tmp/nvm-install.sh | cut -d" " -f1)"
  bash /tmp/nvm-install.sh
  rm /tmp/nvm-install.sh
'
echo "VERIFY nvm: installed"

echo "[3/5] Installing Node.js 22 LTS..."
su - openclaw -c '
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm install 22
  node --version
  npm --version
'
echo "VERIFY node: $(su - openclaw -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"; node --version')"

echo "[4/5] Installing OpenClaw..."
su - openclaw -c '
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  npm install -g @anthropic-ai/openclaw
  openclaw --version
'
echo "VERIFY openclaw: $(su - openclaw -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"; openclaw --version 2>&1 | head -1')"

echo "[5/5] Setting permissions..."
chown -R openclaw:openclaw /home/openclaw
chmod 700 /home/openclaw/.openclaw
echo "VERIFY perms: $(stat -c '%a %U' /home/openclaw/.openclaw)"

echo ""
echo "============================================"
echo "  PHASE 3 COMPLETE"
echo "============================================"
