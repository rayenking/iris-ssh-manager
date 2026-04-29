#!/usr/bin/env bash
set -euo pipefail

REPO="rayenking/iris-ssh-manager"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

info() { printf '\033[1;34m%s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*"; }
error() { printf '\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }

OS="$(uname -s)"
ARCH="$(uname -m)"

install_linux_deb() {
  info "Fetching latest release..."
  TAG=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | head -1 | cut -d'"' -f4)
  [[ -n "$TAG" ]] || error "Failed to fetch latest release tag"
  info "Latest version: $TAG"

  VERSION="${TAG#v}"
  DEB_NAME="Iris-SSH-Manager_${VERSION}_amd64.deb"
  DEB_URL="https://github.com/$REPO/releases/download/$TAG/$DEB_NAME"

  info "Downloading $DEB_NAME..."
  curl -fSL -o "$TMPDIR/$DEB_NAME" "$DEB_URL" || error "Download failed"

  if command -v apt-get &>/dev/null; then
    info "Installing with dpkg..."
    sudo dpkg -i "$TMPDIR/$DEB_NAME" || sudo apt-get install -f -y
  else
    info "Extracting .deb manually (no apt-get)..."
    cd "$TMPDIR"
    ar x "$DEB_NAME"
    sudo tar xf data.tar.* -C /
  fi

  info "Iris SSH Manager $TAG installed!"
}

install_arch() {
  info "Installing on Arch Linux..."

  local deps=(webkit2gtk-4.1 libappindicator-gtk3 librsvg libsecret)
  local missing=()
  for dep in "${deps[@]}"; do
    pacman -Qi "$dep" &>/dev/null || missing+=("$dep")
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    info "Installing dependencies: ${missing[*]}"
    sudo pacman -S --needed --noconfirm "${missing[@]}"
  fi

  info "Fetching latest release..."
  TAG=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | head -1 | cut -d'"' -f4)
  [[ -n "$TAG" ]] || error "Failed to fetch latest release tag"
  info "Latest version: $TAG"

  VERSION="${TAG#v}"
  DEB_NAME="Iris-SSH-Manager_${VERSION}_amd64.deb"
  DEB_URL="https://github.com/$REPO/releases/download/$TAG/$DEB_NAME"

  info "Downloading $DEB_NAME..."
  curl -fSL -o "$TMPDIR/$DEB_NAME" "$DEB_URL" || error "Download failed"

  info "Extracting .deb..."
  cd "$TMPDIR"
  ar x "$DEB_NAME"
  sudo tar xf data.tar.* -C /

  info "Iris SSH Manager $TAG installed!"
}

install_macos() {
  info "Installing on macOS (build from source)..."

  command -v rustc &>/dev/null || error "Rust not found. Install: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
  command -v node &>/dev/null || error "Node.js not found. Install: brew install node"
  command -v npm &>/dev/null || error "npm not found. Install: brew install node"

  info "Cloning repository..."
  git clone --depth 1 "https://github.com/$REPO.git" "$TMPDIR/iris-ssh-manager"
  cd "$TMPDIR/iris-ssh-manager"

  info "Installing dependencies..."
  npm install

  info "Building (this may take a few minutes)..."
  npx tauri build 2>&1 | tail -5

  DMG=$(find src-tauri/target/release/bundle -name "*.dmg" 2>/dev/null | head -1)
  APP=$(find src-tauri/target/release/bundle -name "*.app" -type d 2>/dev/null | head -1)

  if [[ -n "$DMG" ]]; then
    info "Opening DMG installer..."
    open "$DMG"
  elif [[ -n "$APP" ]]; then
    info "Copying to /Applications..."
    cp -r "$APP" /Applications/
    info "Installed to /Applications/$(basename "$APP")"
  else
    BINARY="src-tauri/target/release/app"
    if [[ -f "$BINARY" ]]; then
      sudo cp "$BINARY" /usr/local/bin/iris-ssh-manager
      info "Binary installed to /usr/local/bin/iris-ssh-manager"
    else
      error "Build succeeded but no installable artifact found"
    fi
  fi

  info "Iris SSH Manager installed on macOS!"
}

case "$OS" in
  Linux)
    [[ "$ARCH" == "x86_64" ]] || error "Only x86_64 is supported (got $ARCH)"
    if command -v pacman &>/dev/null; then
      install_arch
    else
      install_linux_deb
    fi
    ;;
  Darwin)
    install_macos
    ;;
  *)
    error "Unsupported OS: $OS. Supported: Linux (x86_64), macOS"
    ;;
esac

info "Run: iris-ssh-manager"
