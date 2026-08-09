import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// 取り込み済みの Instagram メディアIDを記録し、二重投稿を防ぐ。
// data/imported.json はワークフローがコミットして状態を保持する。
const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(here, "..", "data");
const STATE_FILE = resolve(DATA_DIR, "imported.json");

export function loadImported() {
  if (!existsSync(STATE_FILE)) return new Set();
  try {
    const arr = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function saveImported(set) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const arr = [...set];
  writeFileSync(STATE_FILE, JSON.stringify(arr, null, 2) + "\n", "utf8");
}
