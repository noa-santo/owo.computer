import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const source = resolve("node_modules/esbuild-wasm/esbuild.wasm");
const destination = resolve("public/esbuild.wasm");

mkdirSync(resolve("public"), { recursive: true });
copyFileSync(source, destination);

console.log("Copied esbuild WASM to public/esbuild.wasm");
