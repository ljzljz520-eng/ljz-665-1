#!/usr/bin/env bash
# 一键启动：初始化数据库（幂等）并启动平台
set -e
cd "$(dirname "$0")"
echo "==> [1/2] 初始化数据库（幂等，可重复执行）"
node sql/init.js
echo "==> [2/2] 启动低代码平台"
exec node app.js
