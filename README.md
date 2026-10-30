# Canvas Attachment Relinker

Keeps Obsidian canvas file cards synced when vault files are renamed or moved, and repairs broken references.

## Use

The plugin listens for file renames and moves and updates file cards in Canvas files that point to the old path. Run **Repair broken canvas file references** from the command palette to scan for references that are already broken. Try the repair command on a copy of a canvas first; it changes `.canvas` files in the vault.

## Install manually

Copy `manifest.json`, `main.js`, and `styles.css` (if present) into `<vault>/.obsidian/plugins/canvas-attachment-relinker/`, then enable the plugin in Obsidian.

## Source

This repository contains the installed JavaScript plugin. The original TypeScript source is not available in the vault.

## License

MIT. See [LICENSE](LICENSE).
