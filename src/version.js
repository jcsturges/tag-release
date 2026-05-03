'use strict'

const semver = require('semver')
const { getLastTag, getTagDate, getCommitsSinceRef } = require('./git')

const BUMP_PRIORITY = { major: 3, minor: 2, patch: 1 }

function parseConventionalCommit(subject) {
  if (!subject) return null

  // Breaking change markers: feat! / fix! / any-type! or BREAKING CHANGE in body
  if (/^[a-z]+(\([^)]+\))?!:/.test(subject) || /BREAKING[- ]CHANGE/.test(subject)) {
    return 'major'
  }
  if (/^feat(\([^)]+\))?:/.test(subject)) return 'minor'
  if (/^(fix|perf)(\([^)]+\))?:/.test(subject)) return 'patch'

  // Explicitly no-bump types
  if (/^(chore|docs|style|test|tests|ci|build|refactor)(\([^)]+\))?:/.test(subject)) return null

  // Unknown type → no bump (conservative)
  return null
}

function highestBump(commits) {
  let best = null
  for (const { subject } of commits) {
    const bump = parseConventionalCommit(subject)
    if (!bump) continue
    if (!best || BUMP_PRIORITY[bump] > BUMP_PRIORITY[best]) best = bump
    if (best === 'major') break
  }
  return best
}

async function calculateVersion(versionTypeInput) {
  const today = new Date().toISOString().split('T')[0]

  const lastTag = await getLastTag()
  const commits = await getCommitsSinceRef(lastTag)

  const baseVersion = lastTag ? lastTag.replace(/^v/, '') : '0.0.0'

  // Same-day tag → always patch, ignore user input
  if (lastTag) {
    const tagDay = await getTagDate(lastTag)
    if (tagDay === today) {
      return {
        lastTag,
        commits,
        newVersion: 'v' + semver.inc(baseVersion, 'patch'),
        bumpReason: 'same-day patch (tag was created today)',
      }
    }
  }

  // User explicitly picked a bump type
  const explicit = ['major', 'minor', 'patch'].includes(versionTypeInput)
    ? versionTypeInput
    : null

  if (explicit) {
    return {
      lastTag,
      commits,
      newVersion: 'v' + semver.inc(baseVersion, explicit),
      bumpReason: `explicit input: ${explicit}`,
    }
  }

  // Auto: derive from Conventional Commits
  const autoBump = highestBump(commits)

  if (!autoBump) {
    // No bumpable commits found – default to patch so the action still does something useful
    return {
      lastTag,
      commits,
      newVersion: 'v' + semver.inc(baseVersion, 'patch'),
      bumpReason: 'no conventional commit bump found, defaulting to patch',
    }
  }

  return {
    lastTag,
    commits,
    newVersion: 'v' + semver.inc(baseVersion, autoBump),
    bumpReason: `conventional commits auto-detected: ${autoBump}`,
  }
}

module.exports = { calculateVersion, parseConventionalCommit, highestBump }
