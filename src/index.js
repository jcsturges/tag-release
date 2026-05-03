'use strict'

const fs = require('fs')
const core = require('@actions/core')
const github = require('@actions/github')
const { exec, getExecOutput } = require('@actions/exec')

const { calculateVersion } = require('./version')
const { updateChangelog } = require('./changelog')
const { updateVersionFiles } = require('./files')
const { updateReadmeBadge } = require('./readme')
const { updateReleaseMd } = require('./release')
const { updateContributors } = require('./contributors')

// Files that may be updated; non-existent entries are silently ignored by git add
const VERSIONED_FILES = [
  'CHANGELOG.md',
  'RELEASE.md',
  'CONTRIBUTORS.md',
  'README.md',
  'package.json',
  'package-lock.json',
  'pyproject.toml',
  'Cargo.toml',
  'src/version.py',
  '_version.py',
  'src/_version.py',
]

async function hasStagedChanges() {
  const { stdout } = await getExecOutput('git', ['diff', '--cached', '--name-only'], {
    silent: true,
  })
  return stdout.trim().length > 0
}

async function run() {
  try {
    const token = process.env.INPUT_TOKEN
    const versionType = (process.env.INPUT_VERSION_TYPE || 'auto').trim().toLowerCase()
    const defaultBranch = (process.env.INPUT_DEFAULT_BRANCH || 'main').trim()
    const dryRun = (process.env.INPUT_DRY_RUN || 'false').trim() === 'true'

    if (!token) {
      core.setFailed('Input "token" is required')
      return
    }

    const { owner, repo } = github.context.repo

    core.info(`Repository  : ${owner}/${repo}`)
    core.info(`Version type: ${versionType}`)
    if (dryRun) core.info('Dry-run mode – no commits, tags, or releases will be created')

    const { lastTag, commits, newVersion, bumpReason } = await calculateVersion(versionType)

    core.info(`Previous tag: ${lastTag || '(none)'}`)
    core.info(`New version : ${newVersion}  [${bumpReason}]`)
    core.info(`Commits     : ${commits.length}`)

    core.setOutput('version', newVersion)
    core.setOutput('previous-version', lastTag || '')

    if (dryRun) {
      core.info('Dry-run complete.')
      return
    }

    // Update tracked files
    await updateChangelog(newVersion, lastTag, commits, owner, repo, defaultBranch)
    await updateVersionFiles(newVersion)
    await updateReadmeBadge(newVersion, owner, repo)
    await updateReleaseMd(newVersion, lastTag, commits, owner, repo)
    await updateContributors()

    // Stage all known versioned files (git add silently ignores missing paths)
    await exec('git', ['add', '--', ...VERSIONED_FILES], { ignoreReturnCode: true })

    if (await hasStagedChanges()) {
      await exec('git', ['commit', '-m', `chore: release ${newVersion}`])
    }

    // Annotated tag
    await exec('git', ['tag', '-a', newVersion, '-m', `Release ${newVersion}`])

    // Push commit + tag
    await exec('git', ['push'])
    await exec('git', ['push', 'origin', newVersion])

    // Create GitHub Release from RELEASE.md content
    const releaseBody = fs.readFileSync('RELEASE.md', 'utf-8')
    const octokit = github.getOctokit(token)
    const { data: release } = await octokit.rest.repos.createRelease({
      owner,
      repo,
      tag_name: newVersion,
      name: `Release ${newVersion}`,
      body: releaseBody,
      draft: false,
      prerelease: false,
    })

    core.info(`GitHub Release: ${release.html_url}`)
    core.info(`Successfully released ${newVersion}`)
  } catch (err) {
    core.setFailed(err.message)
  }
}

run()
