#!/usr/bin/env sh
set -eu
if command -v python3 >/dev/null 2>&1; then PYTHON="$(command -v python3)"; elif command -v python >/dev/null 2>&1; then PYTHON="$(command -v python)"; else echo "Python 3 is required. In Termux: pkg install python" >&2; exit 1; fi
ROOT="${HOME}/.local/share/blind-agent-room"
BIN="${HOME}/.local/bin"
mkdir -p "$ROOT" "$BIN"
cp ./blindroom.py "$ROOT/blindroom.py"
cat > "$BIN/blindroom" <<EOF
#!/usr/bin/env sh
exec "$PYTHON" "$ROOT/blindroom.py" "\$@"
EOF
chmod +x "$BIN/blindroom"
echo "Installed: $BIN/blindroom"
case ":${PATH}:" in *":${BIN}:"*) ;; *) echo "Add to PATH if needed: export PATH=\"\$HOME/.local/bin:\$PATH\"" ;; esac
"$BIN/blindroom" --version
