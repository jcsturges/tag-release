'use strict'

const fs = require('fs')
const path = require('path')

const CHANGELOG_FILE = 'CHANGELOG.md'
const HEADER = '# Changelog\nAll notable changes to this project will be documented in this file.\n'

function categorize(commits) {
  const added = []
  const changed = []
  const fixed = []
  const removed = []
  const other = []

  for (const { subject, hash } of commits) {
    const short = hash.slice(0, 7)
    const entry = `- ${subject} (${short})`

    if (/^feat(\([^)]+\))?[!:]/.test(subject)) {
      added.push(entry)
    } else if (/^(fix|perf)(\([^)]+\))?[!:]/.test(subject)) {
      fixed.push(entry)
    } else if (/^(refactor|style|update|change)(\([^)]+\))?[!:]/.test(subject)) {
      changed.push(entry)
    } else if (/^(remove|revert|delete)(\([^)]+\))?[!:]/.test(subject)) {
      removed.push(entry)
    } else if (!/^(chore|docs|test|tests|ci|build)(\([^)]+\))?[!:]/.test(subject)) {
      other.push(entry)
    }
  }

  return { added, changed, fixed, removed, other }
}

function buildVersionSection(newVersion, commits, today) {
  const { added, changed, fixed, removed, other } = categorize(commits)
  let section = `## [${newVersion}] - ${today}\n`

  if (!added.length && !changed.length && !fixed.length && !removed.length && !other.length) {
    // Fallback: list everything under Changed
    section += '\n### Changed\n'
    for (const { subject, hash } of commits) {
      section += `- ${subject} (${hash.slice(0, 7)})\n`
    }
    if (!commits.length) section += '- Minor updates\n'
    return section
  }

  if (added.length) section += `\n### Added\n${added.join('\n')}\n`
  if (changed.length) section += `\n### Changed\n${changed.join('\n')}\n`
  if (fixed.length) section += `\n### Fixed\n${fixed.join('\n')}\n`
  if (removed.length) section += `\n### Removed\n${removed.join('\n')}\n`
  if (other.length) section += `\n### Other\n${other.join('\n')}\n`

  return section
}

function buildLinkRefs(content, newVersion, lastTag, repoUrl, defaultBranch) {
  // Strip existing link ref block at end of file
  const withoutRefs = content.replace(/\n(\[(?:Unreleased|v[\d.]+)\]:[^\n]+\n?)+$/, '')

  // Collect all version headers in order (newest first = document order)
  const versionHeaders = [...withoutRefs.matchAll(/^## \[(v[\d.]+)\]/gm)].map((m) => m[1])

  const refs = [`[Unreleased]: ${repoUrl}/compare/${newVersion}...HEAD`]
  for (let i = 0; i < versionHeaders.length; i++) {
    const prev = versionHeaders[i + 1]
    if (prev) {
      refs.push(`[${versionHeaders[i]}]: ${repoUrl}/compare/${prev}...${versionHeaders[i]}`)
    } else {
      refs.push(`[${versionHeaders[i]}]: ${repoUrl}/tree/${versionHeaders[i]}`)
    }
  }

  return withoutRefs.trimEnd() + '\n\n' + refs.join('\n') + '\n'
}

async function updateChangelog(newVersion, lastTag, commits, owner, repo, defaultBranch = 'main') {
  const repoUrl = `https://github.com/${owner}/${repo}`
  const today = new Date().toISOString().split('T')[0]
  const newSection = buildVersionSection(newVersion, commits, today)
  const changelogPath = path.join(process.cwd(), CHANGELOG_FILE)

  let content = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf-8') : ''

  if (!content) {
    content = HEADER + '\n## [Unreleased]\n\n' + newSection + '\n'
  } else {
    const unreleasedMatch = content.match(/^## \[Unreleased\][^\n]*\n/m)
    if (unreleasedMatch) {
      const insertAt = content.indexOf(unreleasedMatch[0]) + unreleasedMatch[0].length
      content = content.slice(0, insertAt) + '\n' + newSection + '\n' + content.slice(insertAt)
    } else {
      // No [Unreleased] header – insert after the top-level heading block
      const headerEnd = content.match(/^#[^\n]*\n[^\n]*\n\n/)
      const insertAt = headerEnd ? headerEnd[0].length : 0
      content =
        content.slice(0, insertAt) +
        '## [Unreleased]\n\n' +
        newSection +
        '\n' +
        content.slice(insertAt)
    }
  }

  content = buildLinkRefs(content, newVersion, lastTag, repoUrl, defaultBranch)

  fs.writeFileSync(changelogPath, content, 'utf-8')
}

module.exports = { updateChangelog }
