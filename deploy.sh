#!/bin/bash
set -e

git pull
cd render-server && npm ci --omit=dev && cd ..
pm2 restart render-server
npx convex dev --once
