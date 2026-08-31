/**
 * The shapes every menu section is built from. They exist so that adding a
 * section is a file with a list of calls in it, rather than one more copy of
 * the same innerHTML.
 */

/** A section heading, optionally carrying the state of what it hides. */
export function sectionHead(list, text, value) {
  const el = document.createElement("div");
  el.className = "invBar";
  el.textContent = text;
  if (value !== undefined) {
    const v = document.createElement("span");
    v.className = "headValue";
    v.textContent = value;
    el.appendChild(v);
  }
  list.appendChild(el);
  return el;
}

/** A label and a value, tappable when it is given something to do. */
export function row(game, list, opts) {
  const el = document.createElement("div");
  el.className = "statRow" + (opts.tap ? " tap" : "") + (opts.on ? " on" : "") +
                 (opts.danger ? " danger" : "") + (opts.hidden ? " hidden" : "");
  if (opts.id) el.id = opts.id;
  el.innerHTML = '<span class="k">' + opts.label + '</span>' +
                 '<span class="v">' + opts.value + "</span>";
  // cells.bind fires on release; the tap() helper the edge buttons use fires on
  // pointerdown, which inside a scrolling body would mean a scroll picks a row.
  if (opts.tap) game.ui.cells.bind(el, opts.tap, null);
  list.appendChild(el);
  return el;
}

/**
 * One of several, drawn as buttons rather than chips: `.chip` carries
 * touch-action pan-x, and inside the panel body that kills the vertical scroll
 * wherever a chip happens to sit.
 */
export function choiceRow(game, list, opts) {
  const label = document.createElement("div");
  label.className = "secLabel";
  label.textContent = opts.label;
  list.appendChild(label);

  const wrap = document.createElement("div");
  wrap.className = "choice";
  for (const choice of opts.choices) {
    const b = document.createElement("div");
    b.className = "btn small" + (choice.value === opts.value ? " on" : "");
    b.textContent = choice.label;
    game.ui.cells.bind(b, () => opts.pick(choice.value), null);
    wrap.appendChild(b);
  }
  list.appendChild(wrap);
  return wrap;
}
