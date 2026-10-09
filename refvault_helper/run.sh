#!/bin/sh
# Read the add-on options, keep yt-dlp current (YouTube changes often), then run the helper.
set -e
OPTS=/data/options.json
export RV_HELPER_URL="$(python -c 'import json;print(json.load(open("/data/options.json")).get("helper_url",""))')"
export RV_POT_URL="$(python -c 'import json;print(json.load(open("/data/options.json")).get("pot_server") or "")')"
export RV_COOKIES="$(python -c 'import json;print(json.load(open("/data/options.json")).get("cookies_file") or "")')"
export RV_LOG_STDOUT=1
if [ -z "$RV_HELPER_URL" ]; then
  echo "Set helper_url in the add-on Configuration tab (RefVault -> Settings -> PC helper -> Create install command, the URL inside it)."
  exec sleep infinity
fi
echo "Updating yt-dlp..."
pip install -q --no-cache-dir -U "yt-dlp[default]" bgutil-ytdlp-pot-provider youtube-transcript-api 2>&1 | tail -n 2 || true
echo "Token server: ${RV_POT_URL:-none}"
if [ -n "$RV_COOKIES" ] && [ -f "$RV_COOKIES" ]; then echo "YouTube cookies: $RV_COOKIES"; else echo "YouTube cookies: none"; fi
python -u /app/refvault_helper.py --check || true
exec python -u /app/refvault_helper.py
