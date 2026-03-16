#!/bin/bash
set -euo pipefail
echo "=== PHASE 4: ROOTLESS DOCKER + LITELLM $(date -u) ==="

echo "[1/7] Enabling lingering for openclaw user..."
loginctl enable-linger openclaw
echo "VERIFY linger: $(loginctl show-user openclaw -p Linger 2>/dev/null || echo 'check manually')"

echo "[2/7] Setting up rootless Docker..."
su - openclaw -c '
  dockerd-rootless-setuptool.sh install 2>&1 | tail -5
  systemctl --user enable docker
  systemctl --user start docker
'
echo "VERIFY rootless docker: running"

echo "[3/7] Testing rootless Docker..."
su - openclaw -c '
  export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock
  docker ps
  docker info 2>/dev/null | grep -E "Root Dir|Security"
'
echo "VERIFY docker ps: works"

echo "[4/7] Creating Docker network for sandbox egress..."
su - openclaw -c '
  export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock
  docker network create openclaw-sandbox-egress 2>/dev/null || echo "Network already exists"
  docker network ls | grep openclaw
'
echo "VERIFY network: created"

echo "[5/7] Creating LiteLLM config..."
su - openclaw -c '
  mkdir -p ~/litellm
  cat > ~/litellm/config.yaml << LITECFG
model_list:
  - model_name: claude-sonnet
    litellm_params:
      model: anthropic/claude-sonnet-4-20250514
      api_key: os.environ/ANTHROPIC_API_KEY
  - model_name: claude-haiku
    litellm_params:
      model: anthropic/claude-3-5-haiku-20241022
      api_key: os.environ/ANTHROPIC_API_KEY

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
LITECFG
  echo "Config written"
'

echo "[6/7] Creating LiteLLM docker-compose..."
LITELLM_KEY=$(openssl rand -hex 16)
su - openclaw -c "
  export DOCKER_HOST=unix:///run/user/\$(id -u)/docker.sock
  cat > ~/litellm/.env << ENVEOF
ANTHROPIC_API_KEY=PLACEHOLDER_WILL_BE_SET
LITELLM_MASTER_KEY=$LITELLM_KEY
ENVEOF
  chmod 600 ~/litellm/.env

  cat > ~/litellm/docker-compose.yml << 'DCEOF'
services:
  litellm:
    image: ghcr.io/berriai/litellm:v1.63.2
    container_name: litellm
    restart: \"no\"
    ports:
      - \"127.0.0.1:4000:4000\"
    volumes:
      - ./config.yaml:/app/config.yaml:ro
    env_file:
      - .env
    command: [\"--config\", \"/app/config.yaml\", \"--port\", \"4000\"]
    networks:
      - openclaw-sandbox-egress
    healthcheck:
      test: [\"CMD\", \"curl\", \"-f\", \"http://localhost:4000/health\"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  openclaw-sandbox-egress:
    external: true
DCEOF
  echo 'docker-compose written'
"

echo "VERIFY LiteLLM key saved (length): $(su - openclaw -c 'wc -c < ~/litellm/.env') bytes"
echo "LITELLM_MASTER_KEY=$LITELLM_KEY"

echo "[7/7] NOTE: Set real Anthropic API key before starting LiteLLM"
echo "  Command: su - openclaw -c \"sed -i 's/PLACEHOLDER_WILL_BE_SET/REAL_KEY/' ~/litellm/.env\""

echo ""
echo "============================================"
echo "  PHASE 4 COMPLETE (LiteLLM configured, not started yet)"
echo "  Start after API key is set"
echo "============================================"
