/**
 * Boots the real game inside jsdom, with the real Three.js and a stubbed
 * renderer. Tests drive the actual UI through pointer events rather than
 * poking at internals, because that is where the bugs have been.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const { link } = require("./link.js");

const ROOT = path.join(__dirname, "..");
const THREE_CACHE = path.join(__dirname, ".three-r128.js");
const THREE_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";

/**
 * Three comes from a CDN in the page; fetch it once and keep it on disk. An
 * installed copy is preferred over the network, so the suite runs offline and
 * behind a proxy - the CDN being unreachable used to fail every test at once.
 */
async function three() {
  if (fs.existsSync(THREE_CACHE)) return fs.readFileSync(THREE_CACHE, "utf8");
  const local = path.join(ROOT, "node_modules", "three", "build", "three.min.js");
  if (fs.existsSync(local)) return fs.readFileSync(local, "utf8");
  const res = await fetch(THREE_URL);
  if (!res.ok) {
    throw new Error("could not fetch three.js: " + res.status +
      " - install it locally with: npm i -D three@0.128.0");
  }
  const src = await res.text();
  fs.writeFileSync(THREE_CACHE, src);
  return src;
}

/**
 * @param {object} opts
 * @param {object} [opts.storage] backing store for localStorage, so a test can
 *   plant a save before boot or inspect one after.
 */
async function boot(opts = {}) {
  const page = fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
    .replace(/<script[\s\S]*?<\/script>/g, "");
  const game = link(path.join(ROOT, "src", "main.js"));

  const dom = new JSDOM(page, { pretendToBeVisual: true, runScripts: "outside-only" });
  const w = dom.window;
  const store = opts.storage || {};

  w.HTMLCanvasElement.prototype.getContext = () => ({
    createImageData: (a, b) => ({ data: new Uint8ClampedArray(a * b * 4) }),
    putImageData() {}
  });
  w.requestAnimationFrame = () => {};
  w.performance = { now: () => Number(process.hrtime.bigint()) / 1e6 };
  w.Element.prototype.setPointerCapture = function () {};
  Object.defineProperty(w, "localStorage", {
    value: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    }
  });

  const errors = [];
  w.addEventListener("error", e =>
    errors.push(String((e.error && e.error.message) || e.message)));

  w.eval(await three());
  w.eval(
    "THREE.WebGLRenderer = class { constructor(o){ this.shadowMap={}; " +
    "this.domElement=o.canvas; } setPixelRatio(){} setSize(){} render(){} };"
  );
  w.eval(game);

  const api = w.game;
  const $ = id => w.document.getElementById(id);
  const ev = (el, type) =>
    el.dispatchEvent(new w.Event(type, { bubbles: true, cancelable: true }));

  return {
    w, store, errors, game: api, $,
    grid: api.grid,
    build: api.build,

    /** Advance the simulation by whole frames. */
    sim(frames, dt = 0.05) { for (let i = 0; i < frames; i++) api._update(dt); },

    tap(el) { ev(el, "pointerdown"); ev(el, "pointerup"); },
    down(el) { ev(el, "pointerdown"); },
    up(el) { ev(el, "pointerup"); },
    hold(el, ms = 600) {
      ev(el, "pointerdown");
      return new Promise(r => setTimeout(() => { ev(el, "pointerup"); r(); }, ms));
    },

    /** Places a structure directly, skipping aim and affordability. */
    place(id, cx, cy) {
      api.build.select(id);
      api.build.create(cx, cy, api.build.selected);
      return api.grid.idx(cx, cy);
    },

    /**
     * A tap on the world itself. The stubbed renderer never runs the matrix
     * update a real frame would, so the raycast behind the tap needs it done
     * by hand first.
     */
    worldTap(x, y) {
      api.scene.updateMatrixWorld(true);
      api.camera.updateMatrixWorld(true);
      for (const type of ["pointerdown", "pointerup"]) {
        const e = new w.Event(type, { bubbles: true, cancelable: true });
        e.pointerId = 7; e.clientX = x; e.clientY = y;
        $("view").dispatchEvent(e);
      }
    },

    /** A cell with nothing on it and no resource node, near the given start. */
    freeCell(cx = 18, cy = 18) {
      const g = api.grid;
      while (!(g.isFree(g.idx(cx, cy)) && !g.node[g.idx(cx, cy)])) cx++;
      return { cx, cy };
    },

    /** Clears the map so a test measures what it meant to measure. */
    clearWorld() {
      api.resources.nodes.slice().forEach(n => n.dispose(true));
      api.resources.nodes.length = 0;
      api.enemies.length = 0;
    },

    type(id) { return api.paths.fields[id].type; }
  };
}

module.exports = { boot };
