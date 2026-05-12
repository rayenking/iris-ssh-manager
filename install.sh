#!/usr/bin/env bash
set -euo pipefail

REPO="rayenking/irisx"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

info() { printf '\033[1;34m%s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*"; }
error() { printf '\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }

OS="$(uname -s)"
ARCH="$(uname -m)"

fetch_tag() {
  TAG=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | head -1 | cut -d'"' -f4)
  [[ -n "$TAG" ]] || error "Failed to fetch latest release tag"
  VERSION="${TAG#v}"
  info "Latest version: $TAG"
}

install_linux_deb() {
  fetch_tag
  local DEB_NAME="Iris.SSH.Manager_${VERSION}_amd64.deb"
  local DEB_URL="https://github.com/$REPO/releases/download/$TAG/$DEB_NAME"

  info "Downloading $DEB_NAME..."
  curl -fSL -o "$TMPDIR/$DEB_NAME" "$DEB_URL" || error "Download failed"

  if command -v apt-get &>/dev/null; then
    info "Installing with dpkg..."
    sudo dpkg -i "$TMPDIR/$DEB_NAME" || sudo apt-get install -f -y
  else
    info "Extracting .deb manually..."
    cd "$TMPDIR"
    ar x "$DEB_NAME"
    sudo tar xf data.tar.* -C /
  fi

  info "IrisX $TAG installed!"
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

  fetch_tag
  local DEB_NAME="Iris.SSH.Manager_${VERSION}_amd64.deb"
  local DEB_URL="https://github.com/$REPO/releases/download/$TAG/$DEB_NAME"

  info "Downloading $DEB_NAME..."
  curl -fSL -o "$TMPDIR/$DEB_NAME" "$DEB_URL" || error "Download failed"

  info "Extracting .deb..."
  cd "$TMPDIR"
  ar x "$DEB_NAME"
  sudo tar xf data.tar.* -C /

  info "IrisX $TAG installed!"
}

install_macos() {
  info "Installing on macOS..."
  fetch_tag

  local DMG_INTEL="Iris.SSH.Manager_${VERSION}_x64.dmg"
  local DMG_ARM="Iris.SSH.Manager_${VERSION}_aarch64.dmg"
  local DMG_NAME

  if [[ "$ARCH" == "arm64" || "$ARCH" == "aarch64" ]]; then
    DMG_NAME="$DMG_ARM"
  else
    DMG_NAME="$DMG_INTEL"
  fi

  local DMG_URL="https://github.com/$REPO/releases/download/$TAG/${DMG_NAME// /.}"

  info "Downloading ${DMG_NAME// /.}..."
  if curl -fSL -o "$TMPDIR/iris.dmg" "$DMG_URL" 2>/dev/null; then
    info "Mounting DMG..."
    local HDIUTIL_OUT
    HDIUTIL_OUT=$(hdiutil attach "$TMPDIR/iris.dmg" -nobrowse 2>&1)
    local MOUNT_POINT
    MOUNT_POINT=$(echo "$HDIUTIL_OUT" | grep -o '/Volumes/[^\t]*' | head -1 | sed 's/[[:space:]]*$//')

    if [[ -z "$MOUNT_POINT" || ! -d "$MOUNT_POINT" ]]; then
      echo "$HDIUTIL_OUT" >&2
      error "Failed to mount DMG"
    fi

    info "Mounted at: $MOUNT_POINT"
    local APP
    APP=$(find "$MOUNT_POINT" -maxdepth 1 -name "*.app" -print -quit 2>/dev/null)

    if [[ -n "$APP" ]]; then
      info "Installing to /Applications..."
      cp -R "$APP" /Applications/
      hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
      info "IrisX $TAG installed to /Applications!"
    else
      info "Contents of $MOUNT_POINT:"
      ls -la "$MOUNT_POINT" 2>/dev/null || true
      hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
      error "No .app found in DMG"
    fi
  else
    warn "Pre-built DMG not available for $ARCH. Building from source..."
    command -v rustc &>/dev/null || error "Rust not found. Install: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    command -v node &>/dev/null || error "Node.js not found. Install: brew install node"

    info "Cloning repository..."
    git clone --depth 1 "https://github.com/$REPO.git" "$TMPDIR/iris-ssh-manager"
    cd "$TMPDIR/iris-ssh-manager"

    info "Installing dependencies..."
    npm install

    info "Building (this may take a few minutes)..."
    npx tauri build 2>&1 | tail -5

    local BUILT_DMG
    BUILT_DMG=$(find src-tauri/target/release/bundle -name "*.dmg" 2>/dev/null | head -1)

    if [[ -n "$BUILT_DMG" ]]; then
      info "Opening DMG installer..."
      open "$BUILT_DMG"
    else
      local BUILT_APP
      BUILT_APP=$(find src-tauri/target/release/bundle -name "*.app" -type d 2>/dev/null | head -1)
      if [[ -n "$BUILT_APP" ]]; then
        cp -R "$BUILT_APP" /Applications/
        info "Installed to /Applications/$(basename "$BUILT_APP")"
      else
        error "Build succeeded but no installable artifact found"
      fi
    fi

    info "IrisX installed from source!"
  fi
}

install_windows() {
  fetch_tag
  local EXE_NAME="Iris.SSH.Manager_${VERSION}_x64-setup.exe"
  local EXE_URL="https://github.com/$REPO/releases/download/$TAG/$(echo "$EXE_NAME" | sed 's/ /%20/g')"

  info "Downloading $EXE_NAME..."
  curl -fSL -o "$TMPDIR/iris-setup.exe" "$EXE_URL" || error "Download failed. Visit https://github.com/$REPO/releases"

  info "Running installer..."
  "$TMPDIR/iris-setup.exe"
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
  MINGW*|MSYS*|CYGWIN*)
    install_windows
    ;;
  *)
    error "Unsupported OS: $OS. Visit https://github.com/$REPO/releases"
    ;;
esac

info "Run: iris-ssh-manager"
