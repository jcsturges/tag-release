"use strict";

const fs = require("fs");
const path = require("path");
const core = require("@actions/core");

// Matches any shields.io version badge we previously wrote
const BADGE_RE = /\[!\[Version]\(https:\/\/img\.shields\.io\/badge\/version-[^)]+\)]\([^)]+\)/;

function buildBadge(newVersion, repoUrl) {
  const encoded = newVersion.replace(/-/g, "--"); // shields.io dash escaping
  const badgeUrl = `https://img.shields.io/badge/version-${encoded}-blue`;
  return `[![Version](${badgeUrl})](${repoUrl}/releases/tag/${newVersion})`;
}

async function updateReadmeBadge(newVersion, owner, repo) {
  const readmePath = path.join(process.cwd(), "README.md");
  if (!fs.existsSync(readmePath)) return;

  const repoUrl = `https://github.com/${owner}/${repo}`;
  const badge = buildBadge(newVersion, repoUrl);
  let content = fs.readFileSync(readmePath, "utf-8");

  if (BADGE_RE.test(content)) {
    content = content.replace(BADGE_RE, badge);
    core.info(`Updated README.md version badge → ${newVersion}`);
  } else {
    // Insert badge on the line immediately after the first # heading
    const headingMatch = content.match(/^(#[^\n]+\n)/);
    if (headingMatch) {
      content = content.replace(headingMatch[0], headingMatch[0] + "\n" + badge + "\n");
      core.info(`Added README.md version badge → ${newVersion}`);
    } else {
      content = badge + "\n\n" + content;
      core.info(`Prepended README.md version badge → ${newVersion}`);
    }
  }

  fs.writeFileSync(readmePath, content, "utf-8");
}

module.exports = { updateReadmeBadge };
