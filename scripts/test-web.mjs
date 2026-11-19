import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const directory = new URL("apps/web/test/", root);
const tests = readdirSync(directory)
  .filter((name) => name.endsWith(".test.tsx"))
  .map((name) => fileURLToPath(new URL(name, directory)));
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...tests], {
  cwd: fileURLToPath(root),
  env: { ...process.env, TSX_TSCONFIG_PATH: fileURLToPath(new URL("apps/web/tsconfig.json", root)) },
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
