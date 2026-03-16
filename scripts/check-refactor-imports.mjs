#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "target",
  "out",
  ".next",
  ".turbo",
]);

const IMPORT_RELATED_DIAGNOSTIC_CODES = new Set([
  2304, // Cannot find name 'X'
  2307, // Cannot find module 'X'
  2552, // Cannot find name 'X'. Did you mean 'Y'?
  2614, // Module has no exported member
  2724, // has no exported member named X. Did you mean Y?
]);

function normalizeFile(filePath) {
  return path.resolve(filePath).split(path.sep).join("/");
}

function stripTsNoCheck(content) {
  return content
    .replace(/^\s*\/\/\s*@ts-nocheck[^\n]*\n?/m, "")
    .replace(/^\s*\/\*\s*@ts-nocheck\s*\*\/\s*\n?/m, "");
}

async function collectTargetFiles(entryPath, bag) {
  const stat = await fs.stat(entryPath);
  if (stat.isDirectory()) {
    const entries = await fs.readdir(entryPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }
      await collectTargetFiles(path.join(entryPath, entry.name), bag);
    }
    return;
  }

  if (!stat.isFile()) {
    return;
  }

  if (SOURCE_EXTENSIONS.has(path.extname(entryPath))) {
    bag.add(normalizeFile(entryPath));
  }
}

function formatDiagnosticMessage(diagnostic) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}

async function parseArgs(argv) {
  const config = {
    root: process.cwd(),
    tsconfig: "tsconfig.json",
    inputs: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--root") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --root");
      }
      config.root = path.resolve(value);
      index += 1;
      continue;
    }
    if (token === "--tsconfig") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --tsconfig");
      }
      config.tsconfig = value;
      index += 1;
      continue;
    }
    config.inputs.push(token);
  }

  if (config.inputs.length === 0) {
    throw new Error(
      "Usage: node scripts/check-refactor-imports.mjs <file-or-dir> [...more paths]",
    );
  }

  return config;
}

async function main() {
  const { root, tsconfig, inputs } = await parseArgs(process.argv.slice(2));

  const targetFiles = new Set();
  for (const rawInput of inputs) {
    const absoluteInput = path.resolve(root, rawInput);
    try {
      await collectTargetFiles(absoluteInput, targetFiles);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read input path "${rawInput}": ${message}`);
    }
  }

  if (targetFiles.size === 0) {
    throw new Error("No .ts/.tsx files found in provided inputs.");
  }

  const configPath = path.resolve(root, tsconfig);
  const configResult = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configResult.error) {
    throw new Error(formatDiagnosticMessage(configResult.error));
  }

  const parsed = ts.parseJsonConfigFileContent(
    configResult.config,
    ts.sys,
    path.dirname(configPath),
    undefined,
    configPath,
  );

  const compilerOptions = {
    ...parsed.options,
    noEmit: true,
    noUnusedLocals: false,
    noUnusedParameters: false,
    incremental: false,
    composite: false,
  };

  const sourceOverrides = new Map();
  for (const fileName of targetFiles) {
    const original = await fs.readFile(fileName, "utf8");
    sourceOverrides.set(fileName, stripTsNoCheck(original));
  }

  const host = ts.createCompilerHost(compilerOptions, true);
  const originalReadFile = host.readFile.bind(host);
  host.readFile = (fileName) => {
    const normalized = normalizeFile(fileName);
    if (sourceOverrides.has(normalized)) {
      return sourceOverrides.get(normalized);
    }
    return originalReadFile(fileName);
  };

  const program = ts.createProgram({
    rootNames: [...targetFiles],
    options: compilerOptions,
    host,
  });

  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file && IMPORT_RELATED_DIAGNOSTIC_CODES.has(diagnostic.code))
    .filter((diagnostic) => targetFiles.has(normalizeFile(diagnostic.file.fileName)));

  if (diagnostics.length === 0) {
    console.log(
      `Refactor import scan passed. Checked ${targetFiles.size} files, no unresolved import/runtime identifiers.`,
    );
    return;
  }

  console.error(
    `Refactor import scan found ${diagnostics.length} unresolved identifier/import issue(s):`,
  );
  for (const diagnostic of diagnostics) {
    const { file, start } = diagnostic;
    const normalized = normalizeFile(file.fileName);
    const relative = path.relative(root, normalized).split(path.sep).join("/");
    const position = file.getLineAndCharacterOfPosition(start ?? 0);
    const message = formatDiagnosticMessage(diagnostic);
    console.error(`- ${relative}:${position.line + 1}:${position.character + 1} [TS${diagnostic.code}] ${message}`);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(
    `check-refactor-imports failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
