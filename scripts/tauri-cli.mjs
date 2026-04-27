#!/usr/bin/env node
/**
 * Thin wrapper around the Tauri CLI.
 *
 * On Linux dev machines, `tauri build` (without an explicit `-b` flag)
 * is narrowed to `-b deb` so the build succeeds even when the
 * linuxdeploy/AppImage toolchain is unavailable (common on Arch, Fedora, etc.).
 *
 * AppImage remains a first-class target:
 *   - tauri.conf.json still lists it in bundle.targets
 *   - CI explicitly runs `npx tauri build -b appimage` on Ubuntu
 *   - Developers can still run `npx tauri build -b appimage` directly
 *
 * All other subcommands (dev, icon, etc.) pass through unchanged.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const isBuild = args[0] === "build";
const isLinux = process.platform === "linux";
const hasExplicitBundle = args.includes("-b") || args.includes("--bundles");

const finalArgs =
  isBuild && isLinux && !hasExplicitBundle
    ? ["build", "-b", "deb", ...args.slice(1)]
    : args;

const __dirname = dirname(fileURLToPath(import.meta.url));
const tauriCli = resolve(__dirname, "..", "node_modules", ".bin", "tauri");

try {
  execFileSync(tauriCli, finalArgs, { stdio: "inherit" });
} catch (err) {
  process.exit(err.status ?? 1);
}
