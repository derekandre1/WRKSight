# Icons

This folder contains **placeholder** icons (a solid brand-blue square) so the
Tauri build runs out of the box on every platform — including Windows, where
`tauri-build` requires a real `.ico` at compile time.

| File           | Purpose                                       |
| -------------- | --------------------------------------------- |
| `32x32.png`    | Linux taskbar / small bundle                  |
| `128x128.png`  | Linux desktop / app drawer                    |
| `icon.png`     | macOS / runtime tray icon (256x256)           |
| `icon.ico`     | Windows resource embedded in the .exe         |
| `icon.icns`    | **Not generated** — required for macOS bundle |

## Regenerating placeholders

```bash
node src-tauri/icons/generate-placeholder-icons.mjs
```

The generator has no external dependencies (only Node's built-in `zlib`).
Output is deterministic, so committing the binaries is safe.

## Replacing with real icons

Drop a single high-resolution source PNG (≥ 1024×1024) into this folder
and run:

```bash
npx @tauri-apps/cli icon path/to/source.png
```

That command replaces every file in this folder, including generating
`icon.icns` for macOS bundles.

## Notes

- The placeholders are intentionally tiny (~1 KB each) so they don't bloat
  history.
- Modern Windows accepts PNG-embedded ICO containers (Vista+), which is
  what `generate-placeholder-icons.mjs` emits.
- The `tauri.conf.json` `bundle.icon` array references `icon.icns`. That
  file is only consumed by `tauri build` on macOS — `tauri dev` and the
  Windows/Linux build scripts ignore it. Add a real `.icns` before
  shipping a macOS release.
