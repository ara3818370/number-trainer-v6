# OpenClaw Self-Hosted Deployment Guide — GCP

**Version:** 2026-03-16
**Tested with:** OpenClaw v2026.3.13, Ubuntu 24.04 LTS, GCP e2-standard-2, europe-west3
**Author:** Battle-tested deployment — every fix here was discovered the hard way.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Phase 1: GCP VM Creation](#phase-1-gcp-vm-creation)
3. [Phase 2: OS Hardening](#phase-2-os-hardening)
4. [Phase 3: Tailscale VPN](#phase-3-tailscale-vpn)
5. [Phase 4: GCP Firewall Lockdown](#phase-4-gcp-firewall-lockdown)
6. [Phase 5: Rootless Docker CE](#phase-5-rootless-docker-ce)
7. [Phase 6: Squid Egress Proxy](#phase-6-squid-egress-proxy)
8. [Phase 7: LiteLLM AI Proxy](#phase-7-litellm-ai-proxy)
9. [Phase 8: OpenClaw Installation](#phase-8-openclaw-installation)
10. [Phase 9: OpenClaw Configuration](#phase-9-openclaw-configuration)
11. [Phase 10: Gateway Launch & Pairing](#phase-10-gateway-launch--pairing)
12. [Phase 11: Post-Deployment Verification](#phase-11-post-deployment-verification)
13. [Troubleshooting](#troubleshooting)
14. [Maintenance](#maintenance)
15. [Critical Fixes Summary](#critical-fixes-summary)

---

## Prerequisites

Gather these BEFORE starting. Every item is required.

| Item | Where to get it | Example |
|------|----------------|---------|
| GCP project with billing | console.cloud.google.com | `my-openclaw-project` |
| Telegram Bot Token | @BotFather on Telegram → `/newbot` | `7123456789:AAF...` |
| Anthropic API Key | console.anthropic.com → API Keys | `sk-ant-api03-...` |
| Tailscale account | tailscale.com/login | Free tier is fine |
| Tailscale auth key | Tailscale admin → Settings → Keys → Generate auth key | `tskey-auth-...` |
| SSH key pair | `ssh-keygen -t ed25519` on your local machine | `~/.ssh/openclaw_ed25519` |
| Your Telegram user ID | @userinfobot on Telegram | `2029914594` |

### DNS (optional but recommended)

If you want a custom domain for webhook/API access, configure DNS after VM creation.

---

## Phase 1: GCP VM Creation

### 1.1 Create the VM via gcloud CLI

```bash
gcloud compute instances create openclaw-server \
  --project=YOUR_PROJECT_ID \
  --zone=europe-west3-a \
  --machine-type=e2-standard-2 \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-balanced \
  --tags=openclaw-server \
  --metadata=ssh-keys="deploy:$(cat ~/.ssh/openclaw_ed25519.pub)"
```

**Why e2-standard-2:** 2 vCPU, 8GB RAM. OpenClaw + LiteLLM + Squid + Docker fit comfortably. e2-micro is too small — OOM kills will happen.

**Why 30GB disk:** OpenClaw Docker images + sandbox containers + logs. 10GB default fills up fast.

### 1.2 Verify creation

```bash
gcloud compute instances describe openclaw-server \
  --zone=europe-west3-a \
  --format="value(status,networkInterfaces[0].accessConfigs[0].natIP)"
```

**Expected output:**
```
RUNNING
34.xxx.xxx.xxx
```

Note the external IP — you need it for initial SSH before Tailscale is set up.

### 1.3 Initial SSH connection

```bash
ssh -i ~/.ssh/openclaw_ed25519 deploy@EXTERNAL_IP
```

> **Note:** This is temporary. After Tailscale + firewall lockdown, you'll SSH via Tailscale IP only.

---

## Phase 2: OS Hardening

All commands in this phase run as `root` (or via `sudo`).

### 2.1 System update

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget gnupg2 lsb-release software-properties-common \
  ufw fail2ban unattended-upgrades apt-listchanges jq uidmap dbus-user-session
```

**Why `uidmap` and `dbus-user-session`:** Required for rootless Docker. Installing them now avoids a dependency error later.

### 2.2 Create the `openclaw` service user

```bash
sudo useradd -m -s /bin/bash openclaw
sudo loginctl enable-linger openclaw
```

> ⚠️ **CRITICAL: `loginctl enable-linger openclaw`**
> Without linger, systemd user services (OpenClaw gateway, rootless Docker) die when the user's session ends.
> This is the #1 cause of "it worked then stopped" issues.

**Verify linger:**
```bash
ls /var/lib/systemd/linger/
```
**Expected:** `openclaw` listed in the directory.

### 2.3 SSH hardening

Edit `/etc/ssh/sshd_config`:

```bash
sudo tee /etc/ssh/sshd_config.d/hardening.conf << 'EOF'
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
LoginGraceTime 20
AllowUsers deploy openclaw
EOF
```

Add SSH key for `openclaw` user:

```bash
sudo mkdir -p /home/openclaw/.ssh
sudo cp ~/.ssh/authorized_keys /home/openclaw/.ssh/
sudo chown -R openclaw:openclaw /home/openclaw/.ssh
sudo chmod 700 /home/openclaw/.ssh
sudo chmod 600 /home/openclaw/.ssh/authorized_keys
```

Restart SSH:

```bash
sudo systemctl restart ssh.service
```

> ⚠️ **CRITICAL: Ubuntu 24.04 uses `ssh.service`, NOT `sshd.service`**
> Running `sudo systemctl restart sshd.service` will FAIL silently or error out.
> This is an Ubuntu 24.04 change from previous versions. Always use `ssh.service`.

**Verify:**
```bash
sudo systemctl status ssh.service
```
**Expected:** `Active: active (running)`

**Test from a second terminal before closing your current session:**
```bash
ssh -i ~/.ssh/openclaw_ed25519 deploy@EXTERNAL_IP
```

### 2.4 UFW firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH - temporary, will restrict after Tailscale'
sudo ufw --force enable
```

**Verify:**
```bash
sudo ufw status verbose
```
**Expected:**
```
Status: active
Default: deny (incoming), allow (outgoing), disabled (routed)
22/tcp    ALLOW IN    Anywhere    # SSH - temporary
```

### 2.5 Fail2Ban

```bash
sudo tee /etc/fail2ban/jail.local << 'EOF'
[sshd]
enabled = true
port = 22
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
findtime = 600
EOF

sudo systemctl enable --now fail2ban
```

**Verify:**
```bash
sudo fail2ban-client status sshd
```
**Expected:** Shows `Currently banned: 0` (or more if attacks have started).

### 2.6 Unattended upgrades

```bash
sudo dpkg-reconfigure -plow unattended-upgrades
# Select "Yes" when prompted
```

**Verify:**
```bash
cat /etc/apt/apt.conf.d/20auto-upgrades
```
**Expected:** Both lines show `"1"`:
```
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
```

---

## Phase 3: Tailscale VPN

### 3.1 Install Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sudo sh
```

### 3.2 Authenticate

```bash
sudo tailscale up --authkey=tskey-auth-YOUR_KEY_HERE --ssh
```

The `--ssh` flag enables Tailscale SSH — direct SSH over the Tailscale network without managing keys.

**Verify:**
```bash
tailscale status
```
**Expected:** Shows your machine name with a `100.x.x.x` Tailscale IP.

```bash
tailscale ip -4
```
**Expected:** `100.x.x.x` — note this IP.

### 3.3 Test Tailscale SSH from your machine

From your local machine (which must also be on Tailscale):

```bash
ssh openclaw@100.x.x.x    # Tailscale IP
```

Or by machine name:

```bash
ssh openclaw@openclaw-server
```

### 3.4 Lock down UFW to Tailscale only

Once Tailscale SSH works:

```bash
sudo ufw delete allow 22/tcp
sudo ufw allow in on tailscale0 to any port 22 comment 'SSH via Tailscale only'
sudo ufw reload
```

**Verify:**
```bash
sudo ufw status
```
**Expected:** Port 22 only allowed on `tailscale0` interface.

> From this point forward, SSH is ONLY available via Tailscale. The GCP external IP port 22 is blocked.

---

## Phase 4: GCP Firewall Lockdown

### 4.1 Remove default allow rules

In GCP Console or via gcloud:

```bash
# List existing firewall rules
gcloud compute firewall-rules list --project=YOUR_PROJECT_ID

# Delete overly permissive default rules
gcloud compute firewall-rules delete default-allow-ssh --project=YOUR_PROJECT_ID --quiet
gcloud compute firewall-rules delete default-allow-rdp --project=YOUR_PROJECT_ID --quiet
gcloud compute firewall-rules delete default-allow-icmp --project=YOUR_PROJECT_ID --quiet
```

### 4.2 Create restrictive rules

```bash
# Allow only Tailscale UDP (port 41641) from anywhere — needed for Tailscale connectivity
gcloud compute firewall-rules create allow-tailscale \
  --project=YOUR_PROJECT_ID \
  --direction=INGRESS \
  --action=ALLOW \
  --rules=udp:41641 \
  --source-ranges=0.0.0.0/0 \
  --target-tags=openclaw-server \
  --description="Tailscale WireGuard UDP"

# Allow internal GCP traffic (health checks, metadata)
gcloud compute firewall-rules create allow-internal \
  --project=YOUR_PROJECT_ID \
  --direction=INGRESS \
  --action=ALLOW \
  --rules=all \
  --source-ranges=10.128.0.0/9 \
  --target-tags=openclaw-server \
  --description="Internal GCP traffic"
```

### 4.3 Verify

```bash
gcloud compute firewall-rules list --project=YOUR_PROJECT_ID \
  --format="table(name,direction,allowed,sourceRanges)"
```

**Expected:** Only `allow-tailscale` (UDP 41641) and `allow-internal` remain for the `openclaw-server` tag. No SSH/RDP from 0.0.0.0/0.

### 4.4 Optional — Remove external IP entirely

If you don't need the VM accessible from the internet at all (Tailscale handles everything):

```bash
gcloud compute instances delete-access-config openclaw-server \
  --zone=europe-west3-a \
  --access-config-name="External NAT"
```

> **Warning:** This removes the external IP. Outbound internet still works via Cloud NAT if configured, or you can keep the external IP for outbound traffic (Squid proxy needs it).

> **Recommendation:** Keep the external IP for now. Squid needs outbound access, and Cloud NAT adds complexity.

---

## Phase 5: Rootless Docker CE

> ⚠️ **CRITICAL: You MUST install Docker CE from Docker's official repository.**
> Ubuntu's `docker.io` package does NOT include `dockerd-rootless-setuptool.sh`.
> Without it, rootless Docker setup is impossible.

### 5.1 Install Docker CE

Run as `root` or `deploy` user with sudo:

```bash
curl -fsSL https://get.docker.com | sudo sh
```

**Verify Docker CE installed (not docker.io):**
```bash
dpkg -l | grep docker
```
**Expected:** Packages like `docker-ce`, `docker-ce-cli`, `containerd.io` — NOT `docker.io`.

### 5.2 Disable root Docker daemon

```bash
sudo systemctl disable --now docker.service docker.socket
```

> ⚠️ **CRITICAL: Disable root Docker BEFORE setting up rootless.**
> If both root and rootless Docker are running, port conflicts and permission issues will occur.

**Verify:**
```bash
sudo systemctl status docker.service
```
**Expected:** `Active: inactive (dead)`

### 5.3 Set up rootless Docker for `openclaw` user

Switch to the `openclaw` user:

```bash
sudo -iu openclaw
```

Run the rootless setup tool:

```bash
dockerd-rootless-setuptool.sh install
```

**Expected output (last lines):**
```
[INFO] Installed docker.service successfully.
[INFO] To control docker.service, run: `systemctl --user (start|stop|restart) docker`
[INFO] Make sure the following environment variables are set (or add them to ~/.bashrc):
export PATH=/usr/bin:$PATH
export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock
```

### 5.4 Configure environment

```bash
# Add to ~/.bashrc
cat >> ~/.bashrc << 'EOF'
export PATH=/usr/bin:$PATH
export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock
EOF

source ~/.bashrc
```

### 5.5 Start and verify rootless Docker

```bash
systemctl --user start docker
systemctl --user enable docker
```

**Verify:**
```bash
docker info 2>&1 | grep -i "security options\|rootless\|context"
```
**Expected:** Should mention `rootless` in security options.

```bash
docker run --rm hello-world
```
**Expected:** `Hello from Docker!` message.

### 5.6 Verify no root Docker running

```bash
# As root/deploy user:
sudo systemctl status docker.service
```
**Expected:** `inactive (dead)`

```bash
# As openclaw user:
systemctl --user status docker
```
**Expected:** `active (running)`

---

## Phase 6: Squid Egress Proxy

Squid restricts which domains containers (LiteLLM, OpenClaw sandbox) can reach. Defense-in-depth: even if a container is compromised, it can only talk to allowlisted domains.

### 6.1 Install Squid

Run as root/deploy with sudo:

```bash
sudo apt install -y squid
```

### 6.2 Configure domain allowlist

```bash
sudo tee /etc/squid/allowed_domains.txt << 'EOF'
# AI API providers
.anthropic.com
.openai.com
.googleapis.com
.google.com

# LiteLLM
.berriai.com
.litellm.ai

# OpenClaw
.openclaw.ai
.docs.openclaw.ai

# Telegram Bot API
.telegram.org
.t.me
api.telegram.org

# Package registries (npm, pip, Docker)
.npmjs.org
.npmjs.com
.registry.npmjs.org
.yarnpkg.com
.pypi.org
.pythonhosted.org
.docker.io
.docker.com
.ghcr.io
.githubusercontent.com

# Tailscale
.tailscale.com
.tailscale.io

# Ubuntu updates
.ubuntu.com
.canonical.com

# General utilities
.github.com
.raw.githubusercontent.com
.brave.com
.search.brave.com
EOF
```

### 6.3 Configure Squid

```bash
sudo tee /etc/squid/conf.d/openclaw.conf << 'EOF'
# OpenClaw egress proxy configuration
acl allowed_domains dstdomain "/etc/squid/allowed_domains.txt"
acl CONNECT method CONNECT

# Allow HTTP and HTTPS to allowlisted domains
http_access allow allowed_domains
http_access allow CONNECT allowed_domains

# Deny everything else
http_access deny all

# Listen on localhost only
http_port 3128

# Minimal logging
access_log daemon:/var/log/squid/access.log squid
cache_log /var/log/squid/cache.log

# No caching — we're a forward proxy, not a cache
cache deny all
EOF
```

### 6.4 Restart and verify

```bash
sudo systemctl restart squid
sudo systemctl enable squid
```

**Verify Squid is running:**
```bash
sudo systemctl status squid
```
**Expected:** `Active: active (running)`

**Test allowlisted domain:**
```bash
curl -x http://127.0.0.1:3128 -s -o /dev/null -w "%{http_code}" https://api.anthropic.com
```
**Expected:** `200` or `401` (unauthorized but reachable — proves proxy allows it).

**Test blocked domain:**
```bash
curl -x http://127.0.0.1:3128 -s -o /dev/null -w "%{http_code}" https://evil.com
```
**Expected:** `403` (blocked by Squid).

---

## Phase 7: LiteLLM AI Proxy

LiteLLM sits between OpenClaw and AI providers. It provides a unified OpenAI-compatible API, request logging, and the ability to switch models without reconfiguring OpenClaw.

### 7.1 Create LiteLLM config directory

Switch to `openclaw` user:

```bash
sudo -iu openclaw
mkdir -p ~/litellm
```

### 7.2 Create LiteLLM config

```bash
cat > ~/litellm/config.yaml << 'EOF'
model_list:
  - model_name: claude-sonnet-4-20250514
    litellm_params:
      model: anthropic/claude-sonnet-4-20250514
      api_key: os.environ/ANTHROPIC_API_KEY

  - model_name: claude-opus-4-20250514
    litellm_params:
      model: anthropic/claude-opus-4-20250514
      api_key: os.environ/ANTHROPIC_API_KEY

litellm_settings:
  drop_params: true
  request_timeout: 600

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
EOF
```

### 7.3 Create environment file

```bash
cat > ~/litellm/.env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY_HERE
LITELLM_MASTER_KEY=sk-litellm-YOUR_RANDOM_SECRET_HERE
EOF
```

Generate a random master key:
```bash
LITELLM_KEY=$(openssl rand -hex 24)
sed -i "s/sk-litellm-YOUR_RANDOM_SECRET_HERE/sk-litellm-${LITELLM_KEY}/" ~/litellm/.env
echo "LiteLLM master key: sk-litellm-${LITELLM_KEY}"
```

> Save the master key — you'll need it for OpenClaw config.

### 7.4 Run LiteLLM container

> ⚠️ **CRITICAL: Use `ghcr.io/berriai/litellm:main-latest` as the image tag.**
> Specific version tags like `v1.63.2` may NOT exist on ghcr.io.
> `main-latest` always points to the latest stable build.

```bash
docker run -d \
  --name litellm \
  --restart unless-stopped \
  --env-file ~/litellm/.env \
  -v ~/litellm/config.yaml:/app/config.yaml \
  -p 4000:4000 \
  ghcr.io/berriai/litellm:main-latest \
  --config /app/config.yaml --port 4000
```

### 7.5 Verify LiteLLM

Wait 15-20 seconds for startup, then:

```bash
curl -s http://127.0.0.1:4000/health | jq .
```
**Expected:**
```json
{
  "healthy_endpoints": [...],
  "unhealthy_endpoints": [],
  ...
}
```

**Test a model call:**
```bash
LITELLM_KEY=$(grep LITELLM_MASTER_KEY ~/litellm/.env | cut -d= -f2)
curl -s http://127.0.0.1:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${LITELLM_KEY}" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "messages": [{"role": "user", "content": "Say hello in one word"}],
    "max_tokens": 10
  }' | jq '.choices[0].message.content'
```
**Expected:** A greeting like `"Hello!"`.

### 7.6 Container logs (if issues)

```bash
docker logs litellm --tail 50
```

---

## Phase 8: OpenClaw Installation

### 8.1 Install Node.js

As `openclaw` user:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

**Verify:**
```bash
node --version
```
**Expected:** `v22.x.x`

### 8.2 Install OpenClaw

> ⚠️ **CRITICAL: The npm package is `openclaw`, NOT `@anthropic-ai/openclaw`.**
> The scoped package name does not exist. Using it will fail with 404.

```bash
sudo npm install -g openclaw
```

**Verify:**
```bash
openclaw --version
```
**Expected:** `2026.3.13` (or later)

### 8.3 Install the gateway service

```bash
openclaw gateway install
```

**What this does:**
- Creates `~/.openclaw/openclaw.json` — the main config file
- Creates a systemd user service for the gateway
- Does NOT start the service yet

> ⚠️ **CRITICAL: The config file is `~/.openclaw/openclaw.json`**
> NOT `config.json`, NOT `~/.openclaw/config.json`.
> `openclaw gateway install` creates this file. All configuration goes here.

**Verify:**
```bash
ls -la ~/.openclaw/openclaw.json
```
**Expected:** File exists with default config.

```bash
systemctl --user list-unit-files | grep openclaw
```
**Expected:** `openclaw-gateway.service` listed.

---

## Phase 9: OpenClaw Configuration

### 9.1 Edit the config file

```bash
nano ~/.openclaw/openclaw.json
```

Replace the contents with this configuration (adjust values for your setup):

```json
{
  "gateway": {
    "bind": "loopback"
  },
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-api03-YOUR_KEY_HERE"
  },
  "channels": {
    "telegram": {
      "botToken": "7123456789:AAF_YOUR_BOT_TOKEN_HERE"
    }
  },
  "agents": {
    "defaults": {
      "model": "claude-sonnet-4-20250514",
      "sandbox": {
        "enabled": true
      }
    }
  }
}
```

### 9.2 Configuration field reference

| Field | Value | Notes |
|-------|-------|-------|
| `gateway.bind` | `"loopback"` | ⚠️ MUST be the string `"loopback"`, NOT `"127.0.0.1"`. Legacy IP format causes crash. |
| `env.ANTHROPIC_API_KEY` | Your Anthropic key | Official method per docs.openclaw.ai/providers/anthropic |
| `channels.telegram.botToken` | Your bot token from BotFather | |
| `agents.defaults.model` | Model name | Must match a model in LiteLLM config if using LiteLLM |
| `agents.defaults.sandbox.enabled` | `true` | Enables Docker sandbox for agent code execution |

> ⚠️ **DO NOT add `agents.defaults.sandbox.backend`** — this key does NOT exist in the OpenClaw schema. Including it may cause validation errors or be silently ignored.

### 9.3 Using LiteLLM as proxy (optional)

If using LiteLLM, modify the config to route through it:

```json
{
  "gateway": {
    "bind": "loopback"
  },
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-api03-YOUR_KEY_HERE"
  },
  "providers": {
    "litellm": {
      "type": "openai-compatible",
      "baseUrl": "http://127.0.0.1:4000/v1",
      "apiKey": "sk-litellm-YOUR_LITELLM_MASTER_KEY"
    }
  },
  "channels": {
    "telegram": {
      "botToken": "7123456789:AAF_YOUR_BOT_TOKEN_HERE"
    }
  },
  "agents": {
    "defaults": {
      "model": "litellm/claude-sonnet-4-20250514",
      "sandbox": {
        "enabled": true
      }
    }
  }
}
```

### 9.4 Verify JSON validity

```bash
cat ~/.openclaw/openclaw.json | jq . > /dev/null && echo "Valid JSON" || echo "INVALID JSON"
```
**Expected:** `Valid JSON`

---

## Phase 10: Gateway Launch & Pairing

### 10.1 Start the gateway

As `openclaw` user:

```bash
systemctl --user start openclaw-gateway
```

**Verify:**
```bash
systemctl --user status openclaw-gateway
```
**Expected:**
```
● openclaw-gateway.service - OpenClaw Gateway
     Active: active (running) since ...
```

**Check logs for errors:**
```bash
journalctl --user -u openclaw-gateway --no-pager -n 30
```
**Expected:** Logs showing gateway startup, Telegram bot connected, no errors.

### 10.2 Enable auto-start on boot

```bash
systemctl --user enable openclaw-gateway
```

Combined with `loginctl enable-linger openclaw` (Phase 2), the gateway will survive reboots and session logouts.

### 10.3 Pair your Telegram account

1. **Open Telegram** and send any message to your bot (e.g., "hello")
2. The bot will reply with a pairing code or you'll see it in the gateway logs
3. **On the server**, approve the pairing:

```bash
openclaw pairing approve telegram PAIRING_CODE
```

Replace `PAIRING_CODE` with the code shown.

**If you don't see a code in chat**, check the logs:

```bash
journalctl --user -u openclaw-gateway --no-pager | grep -i pairing
```

### 10.4 Verify pairing

Send another message to the bot. You should get an AI response.

**If the bot doesn't respond**, check:
```bash
journalctl --user -u openclaw-gateway --no-pager -n 50 | tail -20
```

---

## Phase 11: Post-Deployment Verification

Run this full checklist after deployment.

### 11.1 Service status check

```bash
# All as openclaw user
echo "=== OpenClaw Gateway ==="
systemctl --user status openclaw-gateway --no-pager | head -5

echo "=== Rootless Docker ==="
systemctl --user status docker --no-pager | head -5

echo "=== LiteLLM Container ==="
docker ps --filter name=litellm --format "{{.Names}}: {{.Status}}"

# As root/deploy user
echo "=== Squid ==="
sudo systemctl status squid --no-pager | head -5

echo "=== Tailscale ==="
tailscale status

echo "=== UFW ==="
sudo ufw status

echo "=== Fail2Ban ==="
sudo fail2ban-client status sshd
```

### 11.2 Security verification

```bash
# External SSH should be blocked (test from outside Tailscale)
# This should timeout:
# ssh -o ConnectTimeout=5 deploy@EXTERNAL_IP

# Root Docker should be disabled
sudo systemctl is-active docker.service
# Expected: inactive

# Linger should be enabled
ls /var/lib/systemd/linger/
# Expected: openclaw
```

### 11.3 End-to-end test

1. Send a message to your Telegram bot
2. Verify you get an AI-generated response
3. Ask the bot to run a command (tests sandbox): "Run `uname -a` in the sandbox"
4. Verify the bot executes it and returns output

---

## Troubleshooting

### Error: `systemctl restart sshd.service` fails

**Cause:** Ubuntu 24.04 renamed the SSH service.
**Fix:** Use `ssh.service`:
```bash
sudo systemctl restart ssh.service
```

---

### Error: `npm install -g @anthropic-ai/openclaw` returns 404

**Cause:** Wrong package name.
**Fix:** The correct package is:
```bash
sudo npm install -g openclaw
```

---

### Error: `dockerd-rootless-setuptool.sh: command not found`

**Cause:** You installed Ubuntu's `docker.io` package instead of Docker CE.
**Fix:**
```bash
sudo apt remove -y docker.io
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl disable --now docker.service docker.socket
# Then re-run as openclaw user:
dockerd-rootless-setuptool.sh install
```

---

### Error: LiteLLM container fails to pull with specific version tag

**Symptom:** `docker pull ghcr.io/berriai/litellm:v1.63.2` → manifest not found.
**Cause:** Specific version tags may not be published to ghcr.io.
**Fix:** Use the rolling tag:
```bash
docker pull ghcr.io/berriai/litellm:main-latest
```

---

### Error: OpenClaw gateway crashes on start with bind error

**Symptom:** Logs show error about gateway bind configuration.
**Cause:** `gateway.bind` set to `"127.0.0.1"` (legacy IP format).
**Fix:** In `~/.openclaw/openclaw.json`:
```json
{
  "gateway": {
    "bind": "loopback"
  }
}
```
The value MUST be the string `"loopback"`, not an IP address.

---

### Error: Config changes not taking effect / wrong config file

**Symptom:** You edited `config.json` or `~/.openclaw/config.json` but nothing changed.
**Cause:** The real config file is `~/.openclaw/openclaw.json`.
**Fix:**
```bash
# Find the real config
ls -la ~/.openclaw/openclaw.json

# Edit it
nano ~/.openclaw/openclaw.json

# Restart gateway
systemctl --user restart openclaw-gateway
```

---

### Error: Schema validation fails with `sandbox.backend`

**Symptom:** Gateway logs show schema validation error about `agents.defaults.sandbox.backend`.
**Cause:** This key does not exist in OpenClaw's config schema.
**Fix:** Remove the `backend` key. Only use:
```json
"sandbox": {
  "enabled": true
}
```

---

### Error: Gateway stops after SSH session ends

**Symptom:** Gateway works while you're logged in, dies after logout.
**Cause:** Linger not enabled for the `openclaw` user.
**Fix:**
```bash
sudo loginctl enable-linger openclaw
```

---

### Error: `openclaw pairing approve` — no pairing code

**Symptom:** You sent a message to the bot but don't see a pairing code.
**Fix:** Check the gateway logs:
```bash
journalctl --user -u openclaw-gateway --no-pager | grep -i "pair\|code\|telegram"
```
The code may appear in logs rather than in chat. Also ensure the bot token is correct in `openclaw.json`.

---

### Error: Anthropic API key not found by OpenClaw

**Symptom:** Bot responds with "no API key configured" or similar.
**Cause:** Key not set in the official way.
**Fix:** In `~/.openclaw/openclaw.json`:
```json
{
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-api03-..."
  }
}
```
This is the official method per docs.openclaw.ai/providers/anthropic. Do NOT rely on shell environment variables or `.env` files for OpenClaw's API key.

---

### Error: Docker containers can't reach the internet

**Symptom:** LiteLLM can't reach Anthropic API, OpenClaw sandbox can't fetch packages.
**Possible causes:**
1. Squid not running: `sudo systemctl status squid`
2. Domain not in allowlist: Check `/etc/squid/allowed_domains.txt`
3. Container not configured to use proxy

**Fix for LiteLLM (if using Squid as egress proxy):**
```bash
docker run -d \
  --name litellm \
  --restart unless-stopped \
  --env-file ~/litellm/.env \
  -e HTTP_PROXY=http://host.docker.internal:3128 \
  -e HTTPS_PROXY=http://host.docker.internal:3128 \
  -v ~/litellm/config.yaml:/app/config.yaml \
  -p 4000:4000 \
  --add-host=host.docker.internal:host-gateway \
  ghcr.io/berriai/litellm:main-latest \
  --config /app/config.yaml --port 4000
```

> **Note:** For rootless Docker, `host.docker.internal` mapping may need `--add-host=host.docker.internal:host-gateway`. If that doesn't work, use the host's Tailscale IP or `172.17.0.1` (Docker bridge).

---

### Error: Squid blocks a domain you need

**Fix:** Add the domain to `/etc/squid/allowed_domains.txt` and restart:
```bash
echo ".newdomain.com" | sudo tee -a /etc/squid/allowed_domains.txt
sudo systemctl restart squid
```

---

### Error: Disk space running low

```bash
# Check disk usage
df -h /

# Clean Docker
docker system prune -af

# Clean apt
sudo apt autoremove -y
sudo apt clean
```

---

### Error: Gateway won't start — port already in use

```bash
# Find what's using the port
ss -tlnp | grep :3000  # or whatever port OpenClaw uses

# If it's an old gateway process:
systemctl --user stop openclaw-gateway
pkill -f openclaw
systemctl --user start openclaw-gateway
```

---

## Maintenance

### Updating OpenClaw

```bash
sudo npm update -g openclaw
systemctl --user restart openclaw-gateway
```

**Verify:**
```bash
openclaw --version
```

### Updating LiteLLM

```bash
docker pull ghcr.io/berriai/litellm:main-latest
docker stop litellm && docker rm litellm
# Re-run the docker run command from Phase 7.4
```

### Viewing logs

```bash
# OpenClaw gateway
journalctl --user -u openclaw-gateway -f

# LiteLLM
docker logs -f litellm

# Squid access log
sudo tail -f /var/log/squid/access.log

# System auth (SSH attempts)
sudo tail -f /var/log/auth.log
```

### Backup config

```bash
cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.backup.$(date +%Y%m%d)
```

### Reboot recovery

After a reboot, all services should auto-start because:
- `loginctl enable-linger openclaw` → user services start without login
- `systemctl --user enable openclaw-gateway` → gateway auto-starts
- `systemctl --user enable docker` → rootless Docker auto-starts
- Squid and Tailscale are system services (`systemctl enable`)

**Verify after reboot:**
```bash
sudo -iu openclaw
systemctl --user status openclaw-gateway docker
docker ps
```

---

## Critical Fixes Summary

Quick reference of every gotcha discovered during deployment:

| # | Issue | Wrong | Correct |
|---|-------|-------|---------|
| 1 | SSH service name (Ubuntu 24.04) | `sshd.service` | `ssh.service` |
| 2 | npm package name | `@anthropic-ai/openclaw` | `openclaw` |
| 3 | Docker for rootless | Ubuntu `docker.io` | Docker CE via `https://get.docker.com` |
| 4 | LiteLLM image tag | `litellm:v1.63.2` | `litellm:main-latest` |
| 5 | Config file path | `config.json` | `~/.openclaw/openclaw.json` |
| 6 | Gateway bind value | `"127.0.0.1"` | `"loopback"` |
| 7 | Sandbox backend key | `agents.defaults.sandbox.backend` | Key doesn't exist — omit it |
| 8 | API key in config | Shell env vars / `.env` | `env: { ANTHROPIC_API_KEY }` in `openclaw.json` |
| 9 | Gateway startup | Direct `openclaw gateway start` | `openclaw gateway install` → `systemctl --user start openclaw-gateway` |
| 10 | Telegram pairing | Automatic | `openclaw pairing approve telegram CODE` |
| 11 | Root Docker | Leave running | `systemctl disable --now docker.service docker.socket` |
| 12 | User linger | Not set | `loginctl enable-linger openclaw` |

---

## Architecture Diagram (ASCII)

```
┌─────────────────────────────────────────────────┐
│                  GCP VM (e2-standard-2)         │
│                  Ubuntu 24.04 LTS               │
│                                                  │
│  ┌──────────┐    ┌───────────┐    ┌──────────┐ │
│  │ Telegram  │◄──│  OpenClaw  │──►│ LiteLLM  │ │
│  │ Bot API   │   │  Gateway   │   │ (Docker)  │ │
│  └──────────┘    │ (systemd)  │   └─────┬─────┘ │
│                  └─────┬──────┘         │        │
│                        │                │        │
│                  ┌─────▼──────┐   ┌─────▼─────┐ │
│                  │  Sandbox    │   │ Anthropic  │ │
│                  │ Containers  │   │   API      │ │
│                  │ (rootless   │   └───────────┘ │
│                  │  Docker)    │                  │
│                  └────────────┘                   │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌────────────────┐ │
│  │   UFW    │  │ Fail2Ban │  │  Squid Proxy   │ │
│  │ Firewall │  │          │  │ (egress filter)│ │
│  └──────────┘  └──────────┘  └────────────────┘ │
│                                                   │
│  ┌──────────────────────────────────────────────┐│
│  │              Tailscale VPN                    ││
│  │        (SSH access, no public ports)          ││
│  └──────────────────────────────────────────────┘│
└──────────────────────────────────────────────────┘
```

---

## Time Estimate

| Phase | Duration |
|-------|----------|
| Phase 1: VM Creation | 5 min |
| Phase 2: OS Hardening | 10 min |
| Phase 3: Tailscale | 5 min |
| Phase 4: GCP Firewall | 5 min |
| Phase 5: Rootless Docker | 10 min |
| Phase 6: Squid Proxy | 5 min |
| Phase 7: LiteLLM | 10 min |
| Phase 8: OpenClaw Install | 5 min |
| Phase 9: Configuration | 5 min |
| Phase 10: Launch & Pairing | 5 min |
| Phase 11: Verification | 5 min |
| **Total** | **~70 min** |

---

*Guide last updated: 2026-03-16. Tested on OpenClaw v2026.3.13, Ubuntu 24.04 LTS, GCP europe-west3.*
