// defineConfig: deep-merge a user config over DEFAULTS. No node builtins, so this
// is safe to bundle into a Worker. Arrays and RegExp are replaced, not merged.
import { DEFAULTS } from "./defaults.js";

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v) && !(v instanceof RegExp);
function merge(base, over) {
  const out = { ...base };
  for (const k of Object.keys(over ?? {})) {
    out[k] = isObj(base[k]) && isObj(over[k]) ? merge(base[k], over[k]) : over[k];
  }
  return out;
}
export function defineConfig(config = {}) {
  return merge(DEFAULTS, config);
}
