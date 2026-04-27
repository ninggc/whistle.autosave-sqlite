#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_NAME="whistle.autosave-sqlite"
WHISTLE_CUSTOM_PLUGINS_DIR="$HOME/.WhistleAppData/custom_plugins"

mkdir -p "$WHISTLE_CUSTOM_PLUGINS_DIR"

# 移除旧链接（如果存在）
rm -f "$WHISTLE_CUSTOM_PLUGINS_DIR/$PLUGIN_NAME"

ln -sf "$SCRIPT_DIR" "$WHISTLE_CUSTOM_PLUGINS_DIR/$PLUGIN_NAME"

echo "已安装 $PLUGIN_NAME -> $SCRIPT_DIR"
echo "请执行 w2 restart 使插件生效"
