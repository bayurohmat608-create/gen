#!/usr/bin/env sh
set -eu
rm -rf "${HOME}/.local/share/blind-agent-room"
rm -f "${HOME}/.local/bin/blindroom" "${HOME}/.local/bin/blindroom-web"
echo "Blind Agent Room removed."
