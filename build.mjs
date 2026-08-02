import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL(".", import.meta.url)));

const watch = process.argv.includes("--watch");

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

function copyStatic() {
  cpSync("public", "dist", { recursive: true });
}

const common = {
  bundle: true,
  sourcemap: true,
  logLevel: "info",

  define: { "process.env.NODE_ENV": '"development"' },
};

const contexts = await Promise.all([
  esbuild.context({
    ...common,
    entryPoints: ["src/agent/index.ts"],
    outfile: "dist/agent.js",
    format: "iife",
  }),
  esbuild.context({
    ...common,
    entryPoints: ["src/content/index.ts"],
    outfile: "dist/content.js",
    format: "iife",
  }),
  esbuild.context({
    ...common,
    entryPoints: ["src/background/index.ts"],
    outfile: "dist/background.js",
    format: "esm",
  }),
  esbuild.context({
    ...common,
    entryPoints: ["src/devtools/index.ts"],
    outfile: "dist/devtools.js",
    format: "iife",
  }),
  esbuild.context({
    ...common,
    entryPoints: ["src/panel/index.tsx"],
    outfile: "dist/panel.js",
    format: "iife",
    jsx: "automatic",
  }),
  esbuild.context({
    ...common,
    entryPoints: ["demo/app.jsx"],
    outfile: "demo/build/app.js",
    format: "iife",
    jsx: "automatic",
  }),

  esbuild.context({
    ...common,
    entryPoints: ["demo/app.jsx"],
    outfile: "dist/demo/app.js",
    format: "iife",
    jsx: "automatic",
  }),
]);

copyStatic();

if (watch) {
  await Promise.all(contexts.map((c) => c.watch()));
  console.log("[react-debug] modo watch ativo — edite e recarregue a extensão.");
} else {
  try {
    await Promise.all(contexts.map((c) => c.rebuild()));
  } catch {

    await Promise.all(contexts.map((c) => c.dispose()));
    console.error("[react-debug] build FALHOU — veja os erros acima.");
    process.exit(1);
  }
  await Promise.all(contexts.map((c) => c.dispose()));
  console.log("[react-debug] build concluído em dist/");
}
