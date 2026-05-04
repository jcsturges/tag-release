"use strict";

const fs = require("fs");
const path = require("path");
const core = require("@actions/core");

function updatePackageJson(newVersion) {
  const filePath = path.join(process.cwd(), "package.json");
  if (!fs.existsSync(filePath)) return false;

  const pkg = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  pkg.version = newVersion;
  fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
  core.info(`Updated package.json → ${newVersion}`);
  return true;
}

function updatePackageLockJson(newVersion) {
  const filePath = path.join(process.cwd(), "package-lock.json");
  if (!fs.existsSync(filePath)) return false;

  const lock = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  lock.version = newVersion;
  if (lock.packages?.[""]) lock.packages[""].version = newVersion;
  fs.writeFileSync(filePath, JSON.stringify(lock, null, 2) + "\n", "utf-8");
  core.info(`Updated package-lock.json → ${newVersion}`);
  return true;
}

function updatePyprojectToml(newVersion) {
  const filePath = path.join(process.cwd(), "pyproject.toml");
  if (!fs.existsSync(filePath)) return false;

  const content = fs.readFileSync(filePath, "utf-8");
  const updated = content.replace(/^(version\s*=\s*)["'][^"']*["']/m, `$1"${newVersion}"`);
  if (updated === content) return false;
  fs.writeFileSync(filePath, updated, "utf-8");
  core.info(`Updated pyproject.toml → ${newVersion}`);
  return true;
}

function updateCargoToml(newVersion) {
  const filePath = path.join(process.cwd(), "Cargo.toml");
  if (!fs.existsSync(filePath)) return false;

  const content = fs.readFileSync(filePath, "utf-8");
  // Only update the first version field (in [package] section)
  const updated = content.replace(/^(version\s*=\s*)"[^"]*"/m, `$1"${newVersion}"`);
  if (updated === content) return false;
  fs.writeFileSync(filePath, updated, "utf-8");
  core.info(`Updated Cargo.toml → ${newVersion}`);
  return true;
}

function updateVersionPy(newVersion) {
  // Common patterns: __version__ = "1.0.0" or VERSION = "1.0.0"
  const candidates = ["version.py", "src/version.py", "_version.py", "src/_version.py"];
  for (const rel of candidates) {
    const filePath = path.join(process.cwd(), rel);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf-8");
    const updated = content.replace(
      /^(__version__|VERSION)\s*=\s*["'][^"']*["']/m,
      `$1 = "${newVersion}"`
    );
    if (updated !== content) {
      fs.writeFileSync(filePath, updated, "utf-8");
      core.info(`Updated ${rel} → ${newVersion}`);
      return true;
    }
  }
  return false;
}

async function updateVersionFiles(newVersion) {
  const bare = newVersion.replace(/^v/, "");
  updatePackageJson(bare);
  updatePackageLockJson(bare);
  updatePyprojectToml(bare);
  updateCargoToml(bare);
  updateVersionPy(bare);
}

module.exports = { updateVersionFiles };
