#!/usr/bin/env sh
set -eu
if command -v python3 >/dev/null 2>&1; then PYTHON="$(command -v python3)"; elif command -v python >/dev/null 2>&1; then PYTHON="$(command -v python)"; else echo "Python 3 is required. In Termux: pkg install python" >&2; exit 1; fi
ROOT="${HOME}/.local/share/blind-agent-room"
BIN="${HOME}/.local/bin"
mkdir -p "$ROOT/web" "$BIN"
cp ./blindroom.py "$ROOT/blindroom.py"
cp ./roomcore.py "$ROOT/roomcore.py"
cp ./providerhub.py "$ROOT/providerhub.py"
cp ./webhandler.py "$ROOT/webhandler.py"
cp ./webroom.py "$ROOT/webroom.py"
cp ./web/index.html "$ROOT/web/index.html"
cp ./web/styles.css "$ROOT/web/styles.css"
cp ./web/app.js "$ROOT/web/app.js"
cat > "$BIN/blindroom" <<EOF
#!/usr/bin/env sh
exec "$PYTHON" "$ROOT/blindroom.py" "\$@"
EOF
cat > "$BIN/blindroom-web" <<EOF
#!/usr/bin/env sh
exec "$PYTHON" "$ROOT/webroom.py" "\$@"
EOF
chmod +x "$BIN/blindroom" "$BIN/blindroom-web"
echo "Installed: $BIN/blindroom"
echo "Installed: $BIN/blindroom-web"
case ":${PATH}:" in *":${BIN}:"*) ;; *) echo "Add to PATH if needed: export PATH="\$HOME/.local/bin:\$PATH"" ;; esac
"$BIN/blindroom" --version
echo "Web UI: run blindroom-web, then open http://127.0.0.1:8765"
