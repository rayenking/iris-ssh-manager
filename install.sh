#!/usr/bin/env bash
set -euo pipefail

REPO="rayenking/iris-ssh-manager"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

info() { printf '\033[1;34m%s\033[0m\n' "$*"; }
error() { printf '\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == "Linux" ]] || error "This installer only supports Linux"
[[ "$(uname -m)" == "x86_64" ]] || error "This installer only supports x86_64"

info "Fetching latest release..."
TAG=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | head -1 | cut -d'"' -f4)
[[ -n "$TAG" ]] || error "Failed to fetch latest release tag"
info "Latest version: $TAG"

VERSION="${TAG#v}"
DEB_NAME="Iris-SSH-Manager_${VERSION}_amd64.deb"
DEB_URL="https://github.com/$REPO/releases/download/$TAG/$DEB_NAME"

info "Downloading $DEB_NAME..."
curl -fSL -o "$TMPDIR/$DEB_NAME" "$DEB_URL" || error "Download failed"

info "Installing (requires sudo)..."
if command -v apt-get &>/dev/null; then
  sudo dpkg -i "$TMPDIR/$DEB_NAME" || sudo apt-get install -f -y
elif command -v pacman &>/dev/null; then
  sudo dpkg -i "$TMPDIR/$DEB_NAME" 2>/dev/null || {
    info "dpkg not available, extracting manually..."
    cd "$TMPDIR"
    ar x "$DEB_NAME"
    tar xf data.tar.* -C /
    info "Installed manually from .deb archive"
  }
else
  sudo dpkg -i "$TMPDIR/$DEB_NAME" || error "Install failed. Install dpkg or use manual install."
fi

info "Iris SSH Manager $TAG installed successfully!"
info "Run: iris-ssh-manager"
