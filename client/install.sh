#!/usr/bin/env bash
# ==============================================================================
# R-Tunnel Client Installer for Android Termux
# ==============================================================================

set -e

echo ""
echo -e "\033[1;36m==================================================\033[0m"
echo -e "\033[1;36m       R-Tunnel — Android Termux Installer        \033[0m"
echo -e "\033[1;36m==================================================\033[0m"
echo ""

# 1. Environment & Architecture Checks
echo -e "\033[34m[*] Checking system environment...\033[0m"

IS_TERMUX=false
if [ -d "/data/data/com.termux" ] || [ -n "$TERMUX_VERSION" ]; then
  IS_TERMUX=true
  echo -e "\033[32m[✔] Android Termux detected.\033[0m"
else
  echo -e "\033[33m[!] Non-Termux Linux environment detected (standard Linux).\033[0m"
fi

# 2. Check or Install Node.js
echo -e "\033[34m[*] Verifying Node.js runtime...\033[0m"
if ! command -v node >/dev/null 2>&1; then
  echo -e "\033[33m[!] Node.js is not installed.\033[0m"
  if [ "$IS_TERMUX" = true ]; then
    echo -e "\033[34m[*] Installing Node.js via pkg...\033[0m"
    pkg update -y && pkg install -y nodejs
  else
    echo -e "\033[31m[✖] Please install Node.js (version 18 or newer) before continuing.\033[0m"
    exit 1
  fi
fi

NODE_VERSION=$(node -v)
echo -e "\033[32m[✔] Node.js active: ${NODE_VERSION}\033[0m"

# 3. Create Restrictive Config Directory
RTUNNEL_HOME="$HOME/.rtunnel"
if [ ! -d "$RTUNNEL_HOME" ]; then
  echo -e "\033[34m[*] Creating configuration directory at ${RTUNNEL_HOME}...\033[0m"
  mkdir -p "$RTUNNEL_HOME"
  chmod 700 "$RTUNNEL_HOME"
fi

# 4. Resolve Target Directory for CLI
INSTALL_DIR="$HOME/.rtunnel/cli"
mkdir -p "$INSTALL_DIR"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "\033[34m[*] Copying client files to ${INSTALL_DIR}...\033[0m"
cp -r "$SCRIPT_DIR/"* "$INSTALL_DIR/" 2>/dev/null || true

# 5. Install client dependencies
cd "$INSTALL_DIR"
if [ -f "package.json" ]; then
  echo -e "\033[34m[*] Installing client dependencies...\033[0m"
  npm install --production --silent
fi

chmod +x "$INSTALL_DIR/bin/rtunnel.js"

# 6. Link to PATH
BIN_TARGET="/data/data/com.termux/files/usr/bin/rtunnel"
if [ "$IS_TERMUX" = true ] && [ -d "/data/data/com.termux/files/usr/bin" ]; then
  ln -sf "$INSTALL_DIR/bin/rtunnel.js" "$BIN_TARGET"
  chmod +x "$BIN_TARGET"
  echo -e "\033[32m[✔] Linked rtunnel binary to ${BIN_TARGET}\033[0m"
elif [ -d "$HOME/.local/bin" ]; then
  ln -sf "$INSTALL_DIR/bin/rtunnel.js" "$HOME/.local/bin/rtunnel"
  chmod +x "$HOME/.local/bin/rtunnel"
  echo -e "\033[32m[✔] Linked rtunnel binary to ~/.local/bin/rtunnel\033[0m"
elif [ -d "$PREFIX/bin" ]; then
  ln -sf "$INSTALL_DIR/bin/rtunnel.js" "$PREFIX/bin/rtunnel"
  chmod +x "$PREFIX/bin/rtunnel"
  echo -e "\033[32m[✔] Linked rtunnel binary to $PREFIX/bin/rtunnel\033[0m"
else
  # Add to .bashrc / .zshrc
  SHELL_RC="$HOME/.bashrc"
  if [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
  fi
  if ! grep -q "rtunnel" "$SHELL_RC" 2>/dev/null; then
    echo "export PATH=\"$INSTALL_DIR/bin:\$PATH\"" >> "$SHELL_RC"
    echo -e "\033[32m[✔] Added $INSTALL_DIR/bin to PATH in ${SHELL_RC}\033[0m"
  fi
fi

echo ""
echo -e "\033[1;32m==================================================\033[0m"
echo -e "\033[1;32m       Installation Completed Successfully!       \033[0m"
echo -e "\033[1;32m==================================================\033[0m"
echo ""
echo -e "Next steps:"
echo -e "  1. Configure credentials:"
echo -e "     \033[1;36mrtunnel login\033[0m"
echo -e "  2. Expose your local server:"
echo -e "     \033[1;36mrtunnel 8080\033[0m"
echo ""
