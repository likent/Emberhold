import { choiceRow, row, sectionHead } from "./menu-rows.js";

/* Named here rather than in CONFIG: these are the words on the buttons, not
 * numbers anyone would ever retune. The values are the keys CONFIG looks up. */
const LOOK = [
  { value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }
];
const QUALITY = [
  { value: "low", label: "Fast" }, { value: "normal", label: "Balanced" }, { value: "high", label: "Crisp" }
];
const ZOOM = [
  { value: "near", label: "Near" }, { value: "normal", label: "Normal" }, { value: "far", label: "Far" }
];

/** How the game looks and how it steers. Nothing here touches the run. */
export function renderSettings(game, list) {
  const s = game.settings;
  const pick = key => value => { s.set(key, value); game.menu.refresh(); };
  const flip = key => () => { s.set(key, !s.get(key)); game.menu.refresh(); };

  sectionHead(list, "Settings");

  choiceRow(game, list, {
    label: "Look sensitivity", value: s.get("look"), choices: LOOK, pick: pick("look")
  });
  row(game, list, {
    label: "Invert look", value: s.get("invertY") ? "on" : "off",
    on: s.get("invertY"), tap: flip("invertY")
  });

  // The two below are the frame rate on a phone, which is why they are here
  // and not buried behind the debug switches.
  row(game, list, {
    label: "Shadows", value: s.get("shadows") ? "on" : "off",
    on: s.get("shadows"), tap: flip("shadows")
  });
  choiceRow(game, list, {
    label: "Render quality", value: s.get("quality"), choices: QUALITY, pick: pick("quality")
  });

  choiceRow(game, list, {
    label: "Camera distance", value: s.get("zoom"), choices: ZOOM, pick: pick("zoom")
  });
  row(game, list, {
    label: "Reset settings", value: "defaults",
    tap: () => { s.reset(); game.menu.refresh(); }
  });
}
