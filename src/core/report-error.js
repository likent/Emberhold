/** Surfaces failures on screen: phones have no console. */
export function reportError(err) {
  const box = document.getElementById("errbox");
  const msg = document.getElementById("errmsg");
  if (!box || !msg) return;
  const line = (err && err.stack ? err.stack : String(err)).split("\n").slice(0, 3).join(" | ");
  msg.textContent = line;
  box.classList.add("show");
}
