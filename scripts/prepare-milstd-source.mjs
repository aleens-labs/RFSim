import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const sourceRepoUrl = process.env.RFSIM_MILSTD_REPO_URL || "https://github.com/Esri/joint-military-symbology-xml.git";
const sourceRef = process.env.RFSIM_MILSTD_REF || "094e764";
const checkoutDir = path.join(repoRoot, ".cache", "joint-military-symbology-xml");
const sampleDir = path.join(checkoutDir, "samples", "imagefile_name_category_tags");

function runGit(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: options.cwd || repoRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) {
    throw new Error(`Unable to run git: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stderr || result.stdout || ""}` : "";
    throw new Error(`git ${args.join(" ")} failed.${detail}`);
  }
  return String(result.stdout || "").trim();
}

function ensureGitAvailable() {
  runGit(["--version"], { capture: true });
}

function verifySource() {
  if (!fs.existsSync(sampleDir)) {
    throw new Error(`MIL-STD sample CSV directory is missing: ${sampleDir}`);
  }
}

function prepareSource() {
  ensureGitAvailable();
  fs.mkdirSync(path.dirname(checkoutDir), { recursive: true });

  if (!fs.existsSync(checkoutDir)) {
    runGit(["clone", sourceRepoUrl, checkoutDir]);
  } else if (!fs.existsSync(path.join(checkoutDir, ".git"))) {
    verifySource();
    console.log(`Using existing MIL-STD source directory: ${path.relative(repoRoot, checkoutDir)}`);
    return;
  } else {
    runGit(["remote", "set-url", "origin", sourceRepoUrl], { cwd: checkoutDir });
    runGit(["fetch", "origin"], { cwd: checkoutDir });
  }

  runGit(["checkout", "--detach", sourceRef], { cwd: checkoutDir });
  verifySource();
  const resolvedRef = runGit(["rev-parse", "--short", "HEAD"], { cwd: checkoutDir, capture: true });
  console.log(`MIL-STD source ready at ${path.relative(repoRoot, checkoutDir)} (${resolvedRef}).`);
}

try {
  prepareSource();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error("");
  console.error("Install Git or manually place joint-military-symbology-xml under .cache/joint-military-symbology-xml.");
  process.exit(1);
}
