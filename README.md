# Iris SSH Manager

Iris SSH Manager is a Tauri + Rust + React desktop SSH client and connection manager.

## Implemented capabilities

- Connection management
- Terminal integration
- SFTP browser
- Tunnels
- Snippets / command palette
- Settings / themes
- Packaging setup

## Development

```bash
npm install
npm run dev
npm run tauri dev
npx tsc --noEmit
# from src-tauri/
cargo check
npm run tauri build
```

Advanced runtime features require the real Tauri runtime and a reachable SSH target.
