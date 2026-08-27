/**
 * Guards the file layout itself. The game was one 6900-line HTML file; these
 * checks are what stop it drifting back — an import that resolves to nothing,
 * a name imported that is never exported, a cycle that would make load order
 * matter, or markup creeping back into index.html.
 */
const fs = require("fs");
const path = require("path");
const { link } = require("./link.js");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");

const IMPORT = /^import\s*\{([^}]*)\}\s*from\s*"([^"]+)";$/;
const EXPORT = /^export\s+(?:async\s+)?(?:const|let|var|class|function)\s+([A-Za-z_$][\w$]*)/;

/** Every .js file under src/, repo-relative. */
function modules(dir = SRC, out = []) {
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) modules(full, out);
    else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

function parse(file) {
  const imports = [], exports = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (line.startsWith("import")) {
      const m = IMPORT.exec(line);
      if (!m) { imports.push({ bad: line }); continue; }
      imports.push({
        names: m[1].split(",").map(s => s.trim()).filter(Boolean),
        from: path.resolve(path.dirname(file), m[2]),
        spec: m[2]
      });
    }
    const e = EXPORT.exec(line);
    if (e) exports.push(e[1]);
  }
  return { imports, exports };
}

const files = modules();
const parsed = new Map(files.map(f => [f, parse(f)]));
const rel = f => path.relative(ROOT, f);

exports["every import resolves to a file that exports the name"] = assert => {
  for (const [file, { imports }] of parsed) {
    for (const imp of imports) {
      if (imp.bad) {
        assert(false, "unsupported import syntax", rel(file) + ": " + imp.bad);
        continue;
      }
      assert(fs.existsSync(imp.from), "import target exists",
        rel(file) + " -> " + imp.spec);
      if (!fs.existsSync(imp.from)) continue;
      const available = parsed.get(imp.from).exports;
      for (const name of imp.names) {
        assert(available.includes(name), "imported name is exported",
          rel(file) + " imports " + name + " from " + imp.spec);
      }
    }
  }
};

exports["nothing exported is left unimported"] = assert => {
  const wanted = new Set();
  for (const { imports } of parsed.values())
    for (const imp of imports) (imp.names || []).forEach(n => wanted.add(n));

  for (const [file, { exports: names }] of parsed) {
    // main.js is the entry point; nothing imports from it by design.
    if (file === path.join(SRC, "main.js")) continue;
    for (const n of names) {
      assert(wanted.has(n), "export has a consumer", rel(file) + " exports unused " + n);
    }
  }
};

exports["the module graph has no cycles"] = assert => {
  // link() refuses to bundle a cycle, so this both proves the property and
  // proves the test harness can still boot the game.
  let err = null;
  try { link(path.join(SRC, "main.js")); } catch (e) { err = e.message; }
  assert(err === null, "src/main.js links cleanly", err);
};

exports["index.html carries no inline style or script"] = assert => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert(!/<style[\s>]/.test(html), "no inline <style>");
  assert(!/<script>/.test(html), "no inline <script>");
  assert(html.includes('href="src/styles.css"'), "links the stylesheet");
  assert(html.includes('type="module" src="src/main.js"'), "loads the entry module");
};
