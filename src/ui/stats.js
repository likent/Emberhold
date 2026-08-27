import { CONFIG } from "../data/config.js";
import { ITEMS } from "../data/items.js";

/**
 * Everything that actually decides how the run goes: what the current
 * loadout does, and what the run has amounted to so far.
 */
export function renderStats(game) {
  const list = document.getElementById("statsList");
  const eco = game.economy, eq = game.equip;
  list.innerHTML = "";
  const head = t => {
    const h = document.createElement("div");
    h.className = "invBar"; h.textContent = t;
    list.appendChild(h);
  };
  const row = (k, v, weak) => {
    const r = document.createElement("div");
    r.className = "statRow" + (weak ? " weak" : "");
    r.innerHTML = '<span class="k">' + k + '</span><span class="v">' + v + "</span>";
    list.appendChild(r);
  };
  const dur = entry => entry && entry.dur !== undefined
    ? Math.ceil(entry.dur) + " / " + ITEMS[entry.id].durability : "-";

  const hand = eq.handItem(), handEntry = eq.handEntry();
  head("In hand");
  row("Item", hand ? hand.label : "bare hands", !hand);
  row("Damage per swing", eq.damage);
  if (hand && hand.ranged) {
    row("Shot damage", hand.ranged.damage + " at range " + hand.ranged.range);
    row("Arrows", eco.inv.count("arrow"));
  }
  row("Wood / stone / ore", eq.harvestFor("wood") + " / " + eq.harvestFor("stone") + " / " + eq.harvestFor("ore"));
  if (hand && hand.durability) row("Condition", dur(handEntry));

  const armour = eq.item("armor");
  head("Worn");
  row("Armour", armour ? armour.label : "none", !armour);
  row("Damage taken", Math.round((1 - eq.armor) * 100) + "%");
  row("Move speed", (CONFIG.player.speed * eq.speedMul * (game.core.carrying ? CONFIG.core.carrySpeed : 1)).toFixed(1) +
      (game.core.carrying ? " (carrying the core)" : ""));
  if (armour && armour.durability) row("Condition", dur(eq.worn.armor));

  head("Body");
  row("Health", Math.max(0, Math.round(game.player.hp)) + " / " + CONFIG.player.maxHp);
  row("Food", Math.round(game.player.hunger) + " / " + CONFIG.hunger.max);
  row("Reach", CONFIG.player.attack.range);
  row("Repair rate", eq.repairRate ? eq.repairRate + " hp/s" : "no hammer in hand", !eq.repairRate);

  head("Pathfinding");
  row("Raiders target", game.huntPlayer ? "you" : "the core");
  row("Field rebuilds", game.paths.stats.rate.toFixed(1) + " / s");
  row("Cost per rebuild", game.paths.stats.avg.toFixed(2) + " ms");
  row("Live classes", game.paths.liveClasses());

  head("Save");
  const saveRow = (label, value, fn) => {
    const r = document.createElement("div");
    r.className = "statRow";
    r.innerHTML = '<span class="k">' + label + '</span><span class="v" style="color:var(--accent)">' + value + "</span>";
    game.ui.cells.bind(r, fn, null);
    list.appendChild(r);
  };
  saveRow("Progress", game.saves.has() ? "stored" : "not stored yet", null);
  saveRow("Save now", "save", () => { game.saves.save(); game.panel.refresh(); });
  saveRow("Start over", "wipe", () => { game.saves.wipe(); game.restart(); game.panel.toggle(); });

  head("This run");
  row("Day", game.cycle.day + (game.cycle.isNight ? " (night)" : ""));
  row("Raiders killed", game.stats.kills);
  row("Structures placed", game.stats.built);
  row("Trees planted", game.stats.planted);
  row("Times downed", game.stats.deaths);
  const got = game.stats.gathered;
  const keys = Object.keys(got);
  row("Gathered", keys.length ? keys.map(k => got[k] + " " + k).join(", ") : "nothing yet", !keys.length);
}

