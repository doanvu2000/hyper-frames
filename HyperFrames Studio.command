#!/bin/bash
cd "$(dirname "$0")" || exit 1
# Finder starts .command files without the login profile, so pick up Homebrew and nvm installs of Node.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
printf '\033]0;HyperFrames Studio\007'
if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  Node.js is not installed. Install Node.js 22 or newer, then open this file again."
  echo "  Opening https://nodejs.org ..."
  open https://nodejs.org
  echo
  read -r -p "  Press Return to close." _
  exit 1
fi
node scripts/launch.mjs || read -r -p "  Press Return to close." _
