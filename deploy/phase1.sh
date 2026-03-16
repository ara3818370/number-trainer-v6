#!/bin/bash
set -euo pipefail
exec > >(tee /tmp/phase1.log) 2>&1
echo "=== PHASE 1: OS HARDENING $(date -u) ==="

echo "[1/9] System update..."
apt-get update -qq && apt-get upgrade -y -qq
echo "DONE: system updated"

echo "[2/9] Installing packages..."
apt-get install -y -qq ufw fail2ban unattended-upgrades curl git jq htop tmux age uidmap slirp4netns fuse-overlayfs docker.io docker-compose-v2
echo "VERIFY: $(dpkg -l | grep -cE 'ufw |fail2ban |docker.io |uidmap ') packages found"

echo "[3/9] Creating openclaw user (NO docker group)..."
id openclaw 2>/dev/null && echo "User already exists" || useradd -m -s /bin/bash openclaw
echo "openclaw:$(openssl rand -hex 16)" | chpasswd
echo "VERIFY user: $(id openclaw)"

echo "[4/9] SSH hardening..."
tee /etc/ssh/sshd_config.d/hardening.conf << 'SSHEOF'
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
X11Forwarding no
AllowAgentForwarding no
SSHEOF
systemctl restart sshd
echo "VERIFY SSH: permitrootlogin=$(sshd -T 2>/dev/null | grep permitrootlogin | awk '{print $2}') passwordauth=$(sshd -T 2>/dev/null | grep passwordauthentication | awk '{print $2}')"

echo "[5/9] UFW firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw --force enable
echo "VERIFY UFW: $(ufw status | head -1)"

echo "[6/9] Fail2Ban..."
tee /etc/fail2ban/jail.local << 'F2BEOF'
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
findtime = 600
F2BEOF
systemctl enable --now fail2ban
sleep 2
echo "VERIFY F2B: $(fail2ban-client status sshd 2>&1 | head -1)"

echo "[7/9] Automatic security updates..."
echo 'APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";' > /etc/apt/apt.conf.d/20auto-upgrades
echo "VERIFY updates: $(grep Unattended /etc/apt/apt.conf.d/20auto-upgrades)"

echo "[8/9] Passwordless sudo for audit..."
tee /etc/sudoers.d/openclaw-audit << 'SUDOEOF'
openclaw ALL=(root) NOPASSWD: /usr/sbin/ufw status, /usr/bin/journalctl -u sshd *, /usr/bin/fail2ban-client status sshd
SUDOEOF
chmod 440 /etc/sudoers.d/openclaw-audit
echo "VERIFY sudoers: $(visudo -cf /etc/sudoers.d/openclaw-audit 2>&1)"

echo "[9/9] File permissions..."
mkdir -p /home/openclaw/.openclaw
chown -R openclaw:openclaw /home/openclaw
chmod 700 /home/openclaw/.openclaw
echo "VERIFY perms: $(stat -c '%a %U' /home/openclaw/.openclaw)"

echo ""
echo "============================================"
echo "  PHASE 1 COMPLETE"
echo "============================================"
echo "Full log: /tmp/phase1.log"
