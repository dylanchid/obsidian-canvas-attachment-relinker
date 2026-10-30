const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class TFile {
  constructor(path) {
    this.path = path;
    this.extension = path.split('.').pop();
  }
}
class TFolder {}
class Plugin {
  registerEvent() {}
  addCommand() {}
}

const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const moduleMock = { exports: {} };
vm.runInNewContext(source, {
  module: moduleMock,
  require: (name) => {
    assert.equal(name, 'obsidian');
    return { Plugin, TFile, TFolder, Notice: class {} };
  },
  console,
});

test('serializes quick renames so both canvas references survive', async () => {
  let canvas = JSON.stringify({ nodes: [
    { type: 'file', file: 'old-a.png' },
    { type: 'file', file: 'old-b.png' },
  ] });
  let onRename;
  const plugin = new moduleMock.exports();
  plugin.app = { vault: {
    on: (_event, handler) => { onRename = handler; return {}; },
    getFiles: () => [new TFile('board.canvas')],
    read: async () => {
      const snapshot = canvas;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return snapshot;
    },
    modify: async (_file, data) => { canvas = data; },
    getAbstractFileByPath: (filePath) => filePath.startsWith('new-') ? {} : null,
  } };
  await plugin.onload();

  onRename(new TFile('new-a.png'), 'old-a.png');
  onRename(new TFile('new-b.png'), 'old-b.png');
  await plugin.renameQueue;

  assert.deepEqual(JSON.parse(canvas).nodes.map((node) => node.file), ['new-a.png', 'new-b.png']);
});
