/**
 * Skips `prisma generate` when the client is present and the schema has not
 * changed — avoids Windows EPERM on rename of query_engine-windows.dll.node
 * on every `npm run dev`. Run `npx prisma generate` manually when you edit
 * the schema, or delete node_modules/.prisma and re-run.
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const clientIdx = join(root, "node_modules", ".prisma", "client", "index.js");
const schemaFile = join(root, "prisma", "schema.prisma");

function needsPrismaGenerate() {
  if (!existsSync(clientIdx)) return true;
  if (!existsSync(schemaFile)) return false;
  return statSync(schemaFile).mtimeMs > statSync(clientIdx).mtimeMs;
}

if (needsPrismaGenerate()) {
  const r = spawnSync("npx", ["prisma", "generate"], {
    stdio: "inherit",
    shell: true,
    cwd: root,
    env: process.env,
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

const child = spawn("npx", ["tsx", "watch", "src/index.ts"], {
  stdio: "inherit",
  shell: true,
  cwd: root,
  env: process.env,
});
child.on("close", (code) => process.exit(code ?? 0));
