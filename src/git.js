"use strict";

const { getExecOutput } = require("@actions/exec");

async function gitOutput(args, opts = {}) {
  const { stdout, exitCode } = await getExecOutput("git", args, {
    silent: true,
    ignoreReturnCode: true,
    ...opts
  });
  if (exitCode !== 0) return null;
  return stdout.trim() || null;
}

async function getLastTag() {
  return gitOutput(["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*"]);
}

async function getTagDate(tag) {
  const out = await gitOutput(["log", "-1", "--format=%aI", tag]);
  return out ? out.split("T")[0] : null;
}

async function getFirstCommit() {
  return gitOutput(["rev-list", "--max-parents=0", "HEAD"]);
}

async function getCommitsSinceRef(ref) {
  const range = ref ? `${ref}..HEAD` : "HEAD";
  const out = await gitOutput([
    "log",
    range,
    "--format=%H\x1f%s\x1f%an\x1f%ae\x1f%aI",
    "--no-merges"
  ]);
  if (!out) return [];
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, subject, authorName, authorEmail, authorDate] = line.split("\x1f");
      return { hash, subject, authorName, authorEmail, authorDate };
    });
}

// Returns { name, email, commits, additions, deletions }[] sorted by commit count
async function getAuthorStats() {
  // One-pass: interleaved pretty + numstat
  const out = await gitOutput([
    "log",
    "--no-merges",
    "--pretty=format:COMMIT\x1f%an\x1f%ae",
    "--numstat",
    "HEAD"
  ]);
  if (!out) return [];

  const authorMap = {};
  let current = null;

  for (const line of out.split("\n")) {
    if (line.startsWith("COMMIT\x1f")) {
      const [, name, email] = line.split("\x1f");
      if (!authorMap[email]) {
        authorMap[email] = { name, email, commits: 0, additions: 0, deletions: 0 };
      }
      authorMap[email].commits++;
      current = email;
    } else if (current && /^\d/.test(line)) {
      const parts = line.split("\t");
      authorMap[current].additions += parseInt(parts[0], 10) || 0;
      authorMap[current].deletions += parseInt(parts[1], 10) || 0;
    }
  }

  return Object.values(authorMap).sort((a, b) => b.commits - a.commits);
}

module.exports = {
  gitOutput,
  getLastTag,
  getTagDate,
  getFirstCommit,
  getCommitsSinceRef,
  getAuthorStats
};
