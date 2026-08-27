/**
 * The game ships as native ES modules, which jsdom cannot import. Rather than
 * add a bundler to a project that deliberately has no build step, this walks
 * the import graph and concatenates the modules into one classic script.
 *
 * It only understands the dialect the game actually uses — single-line
 * `import { a, b } from "./x.js";` and `export` as a declaration prefix — and
 * it throws on anything else, so a stray default export fails loudly here
 * rather than silently producing a broken bundle.
 */
const fs = require("fs");
const path = require("path");

const IMPORT = /^import\s*\{([^}]*)\}\s*from\s*"([^"]+)";\s*$/;

/** Depth-first, post-order: a module is emitted after everything it imports. */
function link(entry) {
  const done = new Set();
  const visiting = new Set();
  const chunks = [];

  function visit(file) {
    if (done.has(file)) return;
    if (visiting.has(file)) {
      throw new Error("import cycle through " + path.relative(process.cwd(), file));
    }
    visiting.add(file);

    const body = [];
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (line.startsWith("import")) {
        const m = IMPORT.exec(line);
        if (!m) throw new Error("unsupported import in " + file + ": " + line);
        visit(path.resolve(path.dirname(file), m[2]));
        continue;
      }
      if (line.startsWith("export")) {
        if (!/^export (const|let|var|class|function|async function)\s/.test(line)) {
          throw new Error("unsupported export in " + file + ": " + line);
        }
        body.push(line.slice("export ".length));
        continue;
      }
      body.push(line);
    }

    visiting.delete(file);
    done.add(file);
    chunks.push("/* ---- " + path.relative(path.dirname(entry), file) + " ---- */\n" +
                body.join("\n"));
  }

  visit(path.resolve(entry));
  return '"use strict";\n' + chunks.join("\n");
}

module.exports = { link };
