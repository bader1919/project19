#!/bin/sh
# RefVault PC helper — macOS / Linux installer (no sudo needed).
# Copy the command from RefVault → Settings → PC helper; it sets RV_HELPER_URL and runs this.
set -eu

URL="${RV_HELPER_URL:-}"
APP="${RV_APP:-https://refvault-bader.netlify.app}"
[ -n "$URL" ] || { echo "RV_HELPER_URL is missing. Copy the full install command from RefVault -> Settings -> PC helper." >&2; exit 1; }

DIR="$HOME/.refvault"
mkdir -p "$DIR"
echo "RefVault helper: installing into $DIR"

# uv runs the helper with its own Python and keeps youtube-transcript-api up to date.
if ! command -v uv >/dev/null 2>&1; then
  echo "Installing uv (Python runner, from astral.sh)..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  PATH="$HOME/.local/bin:$PATH"
fi
UV="$(command -v uv)"

pkill -f refvault_helper.py 2>/dev/null || true
curl -fsSL "$APP/helper/refvault_helper.py" -o "$DIR/refvault_helper.py"
printf '{"url": "%s", "uv": "%s"}\n' "$URL" "$UV" > "$DIR/config.json"
chmod 600 "$DIR/config.json"

echo "Checking the connection (first run downloads Python, ~1 minute)..."
"$UV" run --upgrade --script "$DIR/refvault_helper.py" --check

if [ "$(uname)" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/app.refvault.helper.plist"
  mkdir -p "$(dirname "$PLIST")"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>app.refvault.helper</string>
  <key>ProgramArguments</key><array><string>$UV</string><string>run</string><string>--script</string><string>$DIR/refvault_helper.py</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>60</integer>
</dict></plist>
EOF
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
  echo "Done. The RefVault helper is running and starts when you log in."
  echo "Uninstall: launchctl unload $PLIST && rm -rf $PLIST $DIR"
elif command -v systemctl >/dev/null 2>&1 && systemctl --user status >/dev/null 2>&1; then
  UNIT="$HOME/.config/systemd/user/refvault-helper.service"
  mkdir -p "$(dirname "$UNIT")"
  cat > "$UNIT" <<EOF
[Unit]
Description=RefVault PC helper
After=network-online.target

[Service]
ExecStart=$UV run --script $DIR/refvault_helper.py
WorkingDirectory=$DIR
Restart=always
RestartSec=60

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now refvault-helper.service
  echo "Done. The RefVault helper is running (systemd user service 'refvault-helper')."
else
  (crontab -l 2>/dev/null | grep -v refvault_helper; echo "@reboot cd $DIR && $UV run --script $DIR/refvault_helper.py") | crontab -
  (cd "$DIR" && nohup "$UV" run --script "$DIR/refvault_helper.py" >/dev/null 2>&1 &)
  echo "Done. The RefVault helper is running and starts at boot (crontab)."
fi
echo "Log: $DIR/helper.log"
