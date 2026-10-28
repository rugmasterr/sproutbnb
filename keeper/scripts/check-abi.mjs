// Verifies that every function/event the keeper calls (src/abi.ts, compiled to dist/abi.js) exists with the
// same input/output types in the contracts agent's exports (../contracts/abi/*.json).
// Usage (from keeper/): npm run build && npm run check-abi
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const abiDir = join(here, "..", "..", "contracts", "abi");
if (!existsSync(abiDir)) {
  console.log(`skip: ${abiDir} not found (keeper ABIs come from src/abi.ts)`);
  process.exit(0);
}
const k = await import(new URL("../dist/abi.js", import.meta.url));
const pairs = [
  ["factoryAbi", "SproutVaultFactory.json"],
  ["vaultAbi", "SproutVault.json"],
  ["payoutsAbi", "SproutPayouts.json"],
  ["rootsAbi", "SproutRoots.json"],
];
const sig = (t) => (t.type.startsWith("tuple") ? `(${t.components.map(sig).join(",")})${t.type.slice(5)}` : t.type);
let bad = 0;
for (const [name, file] of pairs) {
  const raw = JSON.parse(readFileSync(join(abiDir, file), "utf8"));
  const exported = Array.isArray(raw) ? raw : raw.abi;
  // every custom error the contract can revert with must be decodable by the keeper (same name + inputs)
  for (const e of exported.filter((x) => x.type === "error")) {
    const s = (e.inputs ?? []).map(sig).join(",");
    if (!k[name].some((i) => i.type === "error" && i.name === e.name && (i.inputs ?? []).map(sig).join(",") === s)) {
      console.log(`ERROR NOT DECODABLE ${name}: ${e.name}(${s}) from ${file}`);
      bad++;
    }
  }
  for (const item of k[name]) {
    if (item.type === "error") continue; // the keeper's error list is a superset shared across contracts
    const match = exported.find((e) => e.type === item.type && e.name === item.name &&
      (e.inputs ?? []).map(sig).join(",") === (item.inputs ?? []).map(sig).join(","));
    if (!match) {
      console.log(`MISSING ${name}.${item.name}(${(item.inputs ?? []).map(sig).join(",")}) in ${file}`);
      bad++;
      continue;
    }
    if (item.type === "function") {
      const a = (match.outputs ?? []).map(sig).join(",");
      const b = (item.outputs ?? []).map(sig).join(",");
      if (a !== b) {
        console.log(`OUTPUT MISMATCH ${name}.${item.name}: contracts (${a}) vs keeper (${b})`);
        bad++;
      }
      const view = (m) => m === "view" || m === "pure";
      if (view(match.stateMutability) !== view(item.stateMutability) || (match.stateMutability === "payable") !== (item.stateMutability === "payable")) {
        console.log(`MUTABILITY MISMATCH ${name}.${item.name}: contracts ${match.stateMutability} vs keeper ${item.stateMutability}`);
        bad++;
      }
    }
    if (item.type === "event") {
      const ia = match.inputs.map((i) => `${sig(i)}${i.indexed ? " indexed" : ""}`).join(",");
      const ib = item.inputs.map((i) => `${sig(i)}${i.indexed ? " indexed" : ""}`).join(",");
      if (ia !== ib) {
        console.log(`EVENT MISMATCH ${name}.${item.name}`);
        bad++;
      }
    }
  }
}
console.log(bad ? `${bad} ABI mismatch(es)` : "ABI check: keeper ABIs match ../contracts/abi");
process.exit(bad ? 1 : 0);
