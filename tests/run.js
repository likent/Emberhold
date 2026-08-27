/** Tiny runner: no framework, just files that export a list of checks. */
const fs = require("fs");
const path = require("path");

const files = fs.readdirSync(__dirname)
  .filter(f => f.endsWith(".test.js"))
  .sort();

let passed = 0;
const failures = [];

function assert(cond, label, detail) {
  if (cond) { passed++; return; }
  failures.push(label + (detail ? " — " + detail : ""));
}

(async () => {
  for (const file of files) {
    const suite = require(path.join(__dirname, file));
    process.stdout.write("\n" + file.replace(".test.js", "") + "\n");
    for (const [name, fn] of Object.entries(suite)) {
      const before = failures.length;
      try {
        await fn(assert);
      } catch (e) {
        failures.push(name + " threw: " + e.message);
      }
      const ok = failures.length === before;
      process.stdout.write("  " + (ok ? "ok  " : "FAIL") + "  " + name + "\n");
      if (!ok) {
        failures.slice(before).forEach(f => process.stdout.write("        " + f + "\n"));
      }
    }
  }

  process.stdout.write(
    "\n" + passed + " checks passed, " + failures.length + " failed\n");
  process.exit(failures.length ? 1 : 0);
})();
