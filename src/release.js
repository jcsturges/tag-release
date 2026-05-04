"use strict";

const fs = require("fs");
const path = require("path");

function groupCommits(commits, repoUrl) {
  const features = [];
  const fixes = [];
  const breaking = [];
  const maintenance = [];

  for (const { subject, hash } of commits) {
    const short = hash.slice(0, 7);
    const link = `[${short}](${repoUrl}/commit/${hash})`;
    const entry = `- ${subject} (${link})`;

    if (/^[a-z]+(\([^)]+\))?!:/.test(subject) || /BREAKING[- ]CHANGE/.test(subject)) {
      breaking.push(entry);
    } else if (/^feat(\([^)]+\))?:/.test(subject)) {
      features.push(entry);
    } else if (/^(fix|perf)(\([^)]+\))?:/.test(subject)) {
      fixes.push(entry);
    } else if (/^(chore|docs|style|test|tests|ci|build|refactor)(\([^)]+\))?:/.test(subject)) {
      maintenance.push(entry);
    } else {
      fixes.push(entry); // catch-all into changes
    }
  }

  return { breaking, features, fixes, maintenance };
}

async function updateReleaseMd(newVersion, lastTag, commits, owner, repo) {
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const today = new Date().toISOString().split("T")[0];
  const { breaking, features, fixes, maintenance } = groupCommits(commits, repoUrl);

  const compareBase = lastTag || null;
  const compareUrl = compareBase
    ? `${repoUrl}/compare/${compareBase}...${newVersion}`
    : `${repoUrl}/commits/${newVersion}`;

  let content = `# Release ${newVersion}\n\n`;
  content += `**Date:** ${today}  \n`;
  content += `**Full Changelog:** [${compareBase || "initial"}...${newVersion}](${compareUrl})\n\n`;
  content += `---\n\n`;

  if (breaking.length) {
    content += `## ⚠️ Breaking Changes\n\n${breaking.join("\n")}\n\n`;
  }
  if (features.length) {
    content += `## 🚀 Features\n\n${features.join("\n")}\n\n`;
  }
  if (fixes.length) {
    content += `## 🐛 Bug Fixes & Changes\n\n${fixes.join("\n")}\n\n`;
  }
  if (maintenance.length) {
    content += `## 🧹 Maintenance\n\n${maintenance.join("\n")}\n\n`;
  }

  if (!breaking.length && !features.length && !fixes.length && !maintenance.length) {
    content += `## Changes\n\n`;
    // groupCommits catch-all routes every commit to `fixes`, so when commits
    // is non-empty the guard above is never true — this loop body is unreachable.
    /* c8 ignore start */
    for (const { subject, hash } of commits) {
      content += `- ${subject} ([${hash.slice(0, 7)}](${repoUrl}/commit/${hash}))\n`;
    }
    /* c8 ignore stop */
    if (!commits.length) content += "- Minor updates\n";
    content += "\n";
  }

  fs.writeFileSync(path.join(process.cwd(), "RELEASE.md"), content, "utf-8");
}

module.exports = { updateReleaseMd };
