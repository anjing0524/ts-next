#!/bin/bash

echo "Starting services..."

# Start oauth-service-rust
echo "Starting oauth-service-rust..."
cd /Users/liushuo/code/ts-next-template/apps/oauth-service-rust && DATABASE_URL="sqlite:test.db" cargo run > /Users/liushuo/code/ts-next-template/apps/admin-portal/logs/oauth-service.log 2>&1 &
OAUTH_SERVICE_PID=$!
sleep 5
echo "oauth-service-rust started with PID $OAUTH_SERVICE_PID"

# Start admin-portal
echo "Building admin-portal..."
cd /Users/liushuo/code/ts-next-template/apps/admin-portal && pnpm build
sleep 10
echo "Starting admin-portal..."
cd /Users/liushuo/code/ts-next-template/apps/admin-portal && pnpm start > /Users/liushuo/code/ts-next-template/apps/admin-portal/logs/admin-portal.log 2>&1 &
ADMIN_PORTAL_PID=$!
sleep 10
echo "admin-portal started with PID $ADMIN_PORTAL_PID"

# Start pingora-proxy
echo "Starting pingora-proxy..."
cd /Users/liushuo/code/ts-next-template/apps/pingora-proxy && cargo run > /Users/liushuo/code/ts-next-template/apps/admin-portal/logs/pingora-proxy.log 2>&1 &
PINGORA_PROXY_PID=$!
sleep 5
echo "pingora-proxy started with PID $PINGORA_PROXY_PID"

echo "Services started successfully."
