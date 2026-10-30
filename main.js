const { Notice, Plugin, TFile, TFolder } = require("obsidian");

const BROKEN_MATCH_LIMIT = 10;

module.exports = class CanvasAttachmentRelinkerPlugin extends Plugin {
  async onload() {
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        void this.handleVaultRename(file, oldPath);
      })
    );

    this.addCommand({
      id: "repair-broken-canvas-file-references",
      name: "Repair broken canvas file references",
      callback: () => {
        void this.repairBrokenCanvasReferences();
      },
    });
  }

  async handleVaultRename(file, oldPath) {
    if (!(file instanceof TFile || file instanceof TFolder)) {
      return;
    }

    const canvases = this.getCanvasFiles();
    let updatedCanvases = 0;
    let updatedNodes = 0;

    for (const canvasFile of canvases) {
      const result = await this.updateCanvasFile(canvasFile, (node) => {
        const nextPath = this.getRenamedReference(node.file, oldPath, file.path, file instanceof TFolder);
        if (!nextPath || nextPath === node.file) {
          return false;
        }

        node.file = nextPath;
        return true;
      });

      updatedCanvases += result.updated ? 1 : 0;
      updatedNodes += result.updatedNodes;
    }

    if (updatedNodes > 0) {
      new Notice(`Canvas relinker updated ${updatedNodes} card${updatedNodes === 1 ? "" : "s"} in ${updatedCanvases} canvas${updatedCanvases === 1 ? "" : "es"}.`);
    }
  }

  async repairBrokenCanvasReferences() {
    const filesByName = this.buildFilesByNameIndex();
    const canvases = this.getCanvasFiles();
    let repairedNodes = 0;
    let repairedCanvases = 0;
    let ambiguousNodes = 0;
    let unresolvedNodes = 0;

    for (const canvasFile of canvases) {
      const result = await this.updateCanvasFile(canvasFile, (node) => {
        if (this.app.vault.getAbstractFileByPath(node.file)) {
          return false;
        }

        const basename = node.file.split("/").pop();
        if (!basename) {
          unresolvedNodes++;
          return false;
        }

        const matches = filesByName.get(basename) ?? [];
        if (matches.length === 1) {
          node.file = matches[0].path;
          repairedNodes++;
          return true;
        }

        if (matches.length > 1) {
          ambiguousNodes++;
          return false;
        }

        unresolvedNodes++;
        return false;
      });

      repairedCanvases += result.updated ? 1 : 0;
    }

    const summary = [
      `Repaired ${repairedNodes} broken card${repairedNodes === 1 ? "" : "s"}`,
      `across ${repairedCanvases} canvas${repairedCanvases === 1 ? "" : "es"}.`,
    ].join(" ");

    if (ambiguousNodes > 0 || unresolvedNodes > 0) {
      const details = [];
      if (ambiguousNodes > 0) {
        details.push(`${ambiguousNodes} ambiguous`);
      }
      if (unresolvedNodes > 0) {
        details.push(`${unresolvedNodes} unresolved`);
      }

      new Notice(`${summary} ${details.join(", ")}. Check the console for details.`, 8000);
      console.info("[canvas-attachment-relinker] repair summary", {
        repairedNodes,
        repairedCanvases,
        ambiguousNodes,
        unresolvedNodes,
      });
      return;
    }

    new Notice(summary, 6000);
  }

  getCanvasFiles() {
    return this.app.vault.getFiles().filter((file) => file.extension === "canvas");
  }

  buildFilesByNameIndex() {
    const filesByName = new Map();

    for (const file of this.app.vault.getFiles()) {
      const matches = filesByName.get(file.name) ?? [];
      matches.push(file);
      filesByName.set(file.name, matches);
    }

    return filesByName;
  }

  getRenamedReference(referencePath, oldPath, newPath, isFolderRename) {
    if (typeof referencePath !== "string" || referencePath.length === 0) {
      return null;
    }

    if (referencePath === oldPath) {
      return newPath;
    }

    if (isFolderRename && referencePath.startsWith(`${oldPath}/`)) {
      return `${newPath}${referencePath.slice(oldPath.length)}`;
    }

    return null;
  }

  async updateCanvasFile(canvasFile, mutateNode) {
    let raw;

    try {
      raw = await this.app.vault.cachedRead(canvasFile);
    } catch (error) {
      console.warn("[canvas-attachment-relinker] failed to read canvas", canvasFile.path, error);
      return { updated: false, updatedNodes: 0 };
    }

    let data;

    try {
      data = JSON.parse(raw);
    } catch (error) {
      console.warn("[canvas-attachment-relinker] failed to parse canvas", canvasFile.path, error);
      return { updated: false, updatedNodes: 0 };
    }

    if (!Array.isArray(data?.nodes)) {
      return { updated: false, updatedNodes: 0 };
    }

    let updatedNodes = 0;
    let loggedBrokenMatches = 0;

    for (const node of data.nodes) {
      if (!this.isFileNode(node)) {
        continue;
      }

      const before = node.file;
      const changed = mutateNode(node);
      if (!changed || node.file === before) {
        continue;
      }

      updatedNodes++;

      if (!this.app.vault.getAbstractFileByPath(node.file) && loggedBrokenMatches < BROKEN_MATCH_LIMIT) {
        loggedBrokenMatches++;
        console.warn("[canvas-attachment-relinker] updated node still points to a missing file", {
          canvas: canvasFile.path,
          from: before,
          to: node.file,
        });
      }
    }

    if (updatedNodes === 0) {
      return { updated: false, updatedNodes: 0 };
    }

    await this.app.vault.modify(canvasFile, JSON.stringify(data, null, "\t"));
    return { updated: true, updatedNodes };
  }

  isFileNode(node) {
    return node && node.type === "file" && typeof node.file === "string";
  }
};
