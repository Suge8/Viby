#!/usr/bin/env bash
# Deploy site/ to viby.run via HK-4c8g.
# Idempotent: first run provisions TLS via certbot; later runs just rsync html/assets.

set -euo pipefail

REMOTE=HK-4c8g
# Host paths: nginx runs inside docker and mounts /root/1panel/www -> /www.
# Everything we touch must live under /root/1panel/www so the container sees it.
SITE_ROOT_HOST=/root/1panel/www/sites/viby.run
SITE_ROOT_CONTAINER=/www/sites/viby.run
DIST=$SITE_ROOT_HOST/dist
SSL=$SITE_ROOT_HOST/ssl
LOG=$SITE_ROOT_HOST/log
NGINX_CONF_DIR=/root/1panel/www/conf.d
NGINX_CONTAINER=1Panel-openresty-XrhK
DOMAIN=viby.run
WWW=www.viby.run
EMAIL=${LETSENCRYPT_EMAIL:-admin@viby.run}

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/site"

cd "$ROOT"
test -f "$SRC/index.html" || { echo "missing $SRC/index.html"; exit 1; }

echo "==> ensure remote site layout"
ssh "$REMOTE" "mkdir -p $DIST $SSL $LOG"

echo "==> sync html + assets"
rsync -avz --delete \
  --exclude '*.sh' \
  --exclude '*.md' \
  --exclude 'viby.run.conf' \
  "$SRC/" "$REMOTE:$DIST/"

echo "==> sync nginx conf"
scp -q "$SRC/viby.run.conf" "$REMOTE:$NGINX_CONF_DIR/viby.run.conf"

echo "==> obtain TLS cert if missing"
ssh "$REMOTE" bash -se <<EOF
set -euo pipefail
if [ ! -f $SSL/fullchain.pem ]; then
  if ! command -v certbot >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot
  fi
  # webroot path = same as openresty default acme webroot
  WEBROOT=/root/1panel/apps/openresty/openresty/root
  mkdir -p "\$WEBROOT/.well-known/acme-challenge"
  # write a minimal http-only conf so certbot can complete challenge
  cat > $NGINX_CONF_DIR/viby.run.conf <<NG
server {
  listen 80;
  listen [::]:80;
  server_name $DOMAIN $WWW;
  location ^~ /.well-known/acme-challenge/ { allow all; root /usr/share/nginx/html; }
  location / { return 404; }
}
NG
  docker exec $NGINX_CONTAINER nginx -t
  docker exec $NGINX_CONTAINER nginx -s reload
  certbot certonly --webroot -w "\$WEBROOT" \
    -d $DOMAIN -d $WWW \
    --agree-tos --no-eff-email -n -m $EMAIL \
    --deploy-hook 'docker exec $NGINX_CONTAINER nginx -s reload'
  cp -L /etc/letsencrypt/live/$DOMAIN/fullchain.pem $SSL/fullchain.pem
  cp -L /etc/letsencrypt/live/$DOMAIN/privkey.pem  $SSL/privkey.pem
fi
EOF

echo "==> install final TLS-enabled nginx conf"
scp -q "$SRC/viby.run.conf" "$REMOTE:$NGINX_CONF_DIR/viby.run.conf"

echo "==> validate + reload openresty"
ssh "$REMOTE" "docker exec $NGINX_CONTAINER nginx -t && docker exec $NGINX_CONTAINER nginx -s reload"

echo "==> verify"
ssh "$REMOTE" "curl -sI -m 8 https://$DOMAIN/ | head -1 || true"
echo "done -> https://$DOMAIN"
