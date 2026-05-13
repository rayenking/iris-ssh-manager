#!/usr/bin/env node
/**
 * Thin wrapper around the Tauri CLI for local Linux development.
 *
 * On Linux dev machines, `node scripts/tauri-cli.mjs build` (without an
 * explicit `-b` flag) is narrowed to `-b deb` so the build succeeds even
 * when the linuxdeploy/AppImage toolchain is unavailable.
 *
 * Usage (optional, for local dev only):
 *   node scripts/tauri-cli.mjs build
 *   node scripts/tauri-cli.mjs dev
 *
 * CI uses `pnpm tauri build` which resolves directly to @tauri-apps/cli.
 */

import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const isBuild = args[0] === "build";
const isLinux = process.platform === "linux";
const hasExplicitBundle = args.includes("-b") || args.includes("--bundles");

const finalArgs =
  isBuild && isLinux && !hasExplicitBundle
    ? ["build", "-b", "deb", ...args.slice(1)]
    : args;

try {
  execFileSync("npx", ["tauri", ...finalArgs], { stdio: "inherit", shell: true });
} catch (err) {
  process.exit(err.status ?? 1);
}
