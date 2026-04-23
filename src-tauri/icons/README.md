# Icons

Drop Tauri icons here before building a release bundle:

```
icon.png      # 512x512 base
32x32.png
128x128.png
icon.icns     # macOS
icon.ico      # Windows
```

Generate them from a single source with:

```bash
npx @tauri-apps/cli icon path/to/icon.png
```

Development (`npm run tauri:dev`) does not strictly require all icon formats.
