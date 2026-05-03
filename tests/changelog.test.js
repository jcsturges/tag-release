'use strict'

const fs = require('fs')
const { updateChangelog } = require('../src/changelog')

// changelog.js does not import @actions/core, so no mock needed there.
// We spy on fs methods so the module under test uses our fixtures.

afterEach(() => jest.restoreAllMocks())

// Helper: run updateChangelog and return what was written
async function run(opts = {}) {
  const {
    existingContent = null,
    newVersion = 'v1.0.0',
    lastTag = null,
    commits = [],
    owner = 'owner',
    repo = 'repo',
    defaultBranch = 'main',
  } = opts

  let written = ''
  jest.spyOn(fs, 'existsSync').mockReturnValue(existingContent !== null)
  jest.spyOn(fs, 'readFileSync').mockReturnValue(existingContent || '')
  jest.spyOn(fs, 'writeFileSync').mockImplementation((_path, content) => { written = content })

  await updateChangelog(newVersion, lastTag, commits, owner, repo, defaultBranch)
  return written
}

const REPOURL = 'https://github.com/owner/repo'

// ─── Fresh file ───────────────────────────────────────────────────────────────

describe('no existing CHANGELOG.md', () => {
  test('creates file with standard header and Unreleased section', async () => {
    const out = await run({ newVersion: 'v1.0.0' })
    expect(out).toContain('# Changelog')
    expect(out).toContain('## [Unreleased]')
    expect(out).toContain('## [v1.0.0]')
  })

  test('includes correct link refs when there is no previous tag', async () => {
    const out = await run({ newVersion: 'v1.0.0', lastTag: null })
    expect(out).toContain(`[Unreleased]: ${REPOURL}/compare/v1.0.0...HEAD`)
    expect(out).toContain(`[v1.0.0]: ${REPOURL}/tree/v1.0.0`)
  })

  test('fallback Changed section when commits are all no-bump types', async () => {
    const commits = [
      { hash: 'aaa1111bbb2222c', subject: 'chore: update deps' },
      { hash: 'bbb2222ccc3333d', subject: 'docs: fix typo' },
    ]
    const out = await run({ newVersion: 'v1.0.0', commits })
    expect(out).toContain('### Changed')
    // chore/docs still appear in the fallback listing
    expect(out).toContain('chore: update deps')
  })

  test('fallback "- Minor updates" when there are zero commits', async () => {
    const out = await run({ newVersion: 'v1.0.0', commits: [] })
    expect(out).toContain('- Minor updates')
  })
})

// ─── Commit categorization ────────────────────────────────────────────────────

describe('commit categorization', () => {
  const mkCommit = (subject, hash = 'aabbccdd11223') => ({ subject, hash })

  test('feat → ### Added', async () => {
    const out = await run({ commits: [mkCommit('feat: add OAuth')] })
    expect(out).toContain('### Added')
    expect(out).toContain('feat: add OAuth')
  })

  test('feat! → ### Added (breaking marker does not remove from Added)', async () => {
    const out = await run({ commits: [mkCommit('feat!: redesign auth')] })
    expect(out).toContain('### Added')
  })

  test('fix → ### Fixed', async () => {
    const out = await run({ commits: [mkCommit('fix: null crash')] })
    expect(out).toContain('### Fixed')
    expect(out).toContain('fix: null crash')
  })

  test('perf → ### Fixed', async () => {
    const out = await run({ commits: [mkCommit('perf: cache queries')] })
    expect(out).toContain('### Fixed')
  })

  test('refactor → ### Changed', async () => {
    const out = await run({ commits: [mkCommit('refactor: extract helper')] })
    expect(out).toContain('### Changed')
  })

  test('style → ### Changed', async () => {
    const out = await run({ commits: [mkCommit('style: reformat')] })
    expect(out).toContain('### Changed')
  })

  test('update → ### Changed', async () => {
    const out = await run({ commits: [mkCommit('update: config')] })
    expect(out).toContain('### Changed')
  })

  test('change → ### Changed', async () => {
    const out = await run({ commits: [mkCommit('change: something')] })
    expect(out).toContain('### Changed')
  })

  test('remove → ### Removed', async () => {
    const out = await run({ commits: [mkCommit('remove: old endpoint')] })
    expect(out).toContain('### Removed')
  })

  test('revert → ### Removed', async () => {
    const out = await run({ commits: [mkCommit('revert: bad commit')] })
    expect(out).toContain('### Removed')
  })

  test('delete → ### Removed', async () => {
    const out = await run({ commits: [mkCommit('delete: old file')] })
    expect(out).toContain('### Removed')
  })

  test('unknown non-excluded type → ### Other', async () => {
    const out = await run({ commits: [mkCommit('bump: dependencies')] })
    expect(out).toContain('### Other')
  })

  test('chore/docs/test/ci/build are excluded from all sections', async () => {
    const noOpCommits = [
      mkCommit('chore: update deps'),
      mkCommit('docs: fix readme'),
      mkCommit('test: add coverage'),
      mkCommit('tests: more tests'),
      mkCommit('ci: update workflow'),
      mkCommit('build: bump node'),
    ]
    const out = await run({ commits: noOpCommits })
    // All no-op → fallback Changed section lists them verbatim
    expect(out).toContain('### Changed')
    // But no Added / Fixed / Removed / Other headers
    expect(out).not.toContain('### Added')
    expect(out).not.toContain('### Fixed')
    expect(out).not.toContain('### Removed')
    expect(out).not.toContain('### Other')
  })

  test('short hash (first 7 chars) appears in entry', async () => {
    const out = await run({
      commits: [{ hash: '1234567890abcdef', subject: 'feat: thing' }],
    })
    expect(out).toContain('1234567')
    expect(out).not.toContain('1234567890abcdef')
  })
})

// ─── Inserting into existing file with [Unreleased] ──────────────────────────

describe('existing CHANGELOG with [Unreleased] header', () => {
  const existing = [
    '# Changelog',
    'All notable changes to this project will be documented in this file.',
    '',
    '## [Unreleased]',
    '',
    '## [v0.9.0] - 2024-01-01',
    '',
    '### Changed',
    '- something old',
    '',
    '[Unreleased]: https://github.com/owner/repo/compare/v0.9.0...HEAD',
    '[v0.9.0]: https://github.com/owner/repo/tree/v0.9.0',
  ].join('\n')

  test('new version section appears before existing version', async () => {
    const out = await run({ existingContent: existing, newVersion: 'v1.0.0', lastTag: 'v0.9.0' })
    const v1Pos = out.indexOf('## [v1.0.0]')
    const v09Pos = out.indexOf('## [v0.9.0]')
    expect(v1Pos).toBeGreaterThan(-1)
    expect(v1Pos).toBeLessThan(v09Pos)
  })

  test('updates [Unreleased] link ref to point to new version', async () => {
    const out = await run({ existingContent: existing, newVersion: 'v1.0.0', lastTag: 'v0.9.0' })
    expect(out).toContain('[Unreleased]: https://github.com/owner/repo/compare/v1.0.0...HEAD')
  })

  test('adds compare link between new and previous version', async () => {
    const out = await run({ existingContent: existing, newVersion: 'v1.0.0', lastTag: 'v0.9.0' })
    expect(out).toContain('[v1.0.0]: https://github.com/owner/repo/compare/v0.9.0...v1.0.0')
  })

  test('old link refs are removed and replaced', async () => {
    const out = await run({ existingContent: existing, newVersion: 'v1.0.0', lastTag: 'v0.9.0' })
    // Old [Unreleased] ref pointing to v0.9.0 should be gone
    expect(out).not.toContain('compare/v0.9.0...HEAD')
  })

  test('[Unreleased] header is preserved', async () => {
    const out = await run({ existingContent: existing, newVersion: 'v1.0.0', lastTag: 'v0.9.0' })
    expect(out).toContain('## [Unreleased]')
  })
})

// ─── Inserting into existing file WITHOUT [Unreleased] ───────────────────────

describe('existing CHANGELOG without [Unreleased] header', () => {
  test('inserts [Unreleased] and new section after the heading block', async () => {
    const existing = [
      '# Changelog',
      'All notable changes to this project will be documented in this file.',
      '',
      '## [v0.9.0] - 2024-01-01',
      '',
      '### Changed',
      '- something',
    ].join('\n')

    const out = await run({ existingContent: existing, newVersion: 'v1.0.0' })
    expect(out).toContain('## [Unreleased]')
    const unreleasedPos = out.indexOf('## [Unreleased]')
    const v09Pos = out.indexOf('## [v0.9.0]')
    expect(unreleasedPos).toBeLessThan(v09Pos)
  })

  test('prepends when file has no top-level # heading', async () => {
    const existing = [
      '## [v0.5.0] - 2023-01-01',
      '',
      '### Changed',
      '- initial release',
    ].join('\n')

    const out = await run({ existingContent: existing, newVersion: 'v1.0.0' })
    expect(out).toContain('## [Unreleased]')
    expect(out.indexOf('## [Unreleased]')).toBe(0)
  })
})

// ─── Default parameter ────────────────────────────────────────────────────────

describe('defaultBranch parameter', () => {
  test('uses "main" when defaultBranch is omitted entirely', async () => {
    // Call the function directly (bypassing the run() helper) to trigger
    // the defaultBranch = 'main' default parameter branch.
    let written = ''
    jest.spyOn(fs, 'existsSync').mockReturnValue(false)
    jest.spyOn(fs, 'readFileSync').mockReturnValue('')
    jest.spyOn(fs, 'writeFileSync').mockImplementation((_, content) => { written = content })

    await updateChangelog('v1.0.0', null, [], 'owner', 'repo')

    expect(written).toContain('## [v1.0.0]')
    expect(written).toContain('[Unreleased]: https://github.com/owner/repo/compare/v1.0.0...HEAD')
  })
})

// ─── Link reference management ────────────────────────────────────────────────

describe('link references', () => {
  test('three-version history produces correct compare chain', async () => {
    const existing = [
      '# Changelog',
      'All notable changes.',
      '',
      '## [Unreleased]',
      '',
      '## [v0.9.0] - 2024-06-01',
      '',
      '## [v0.8.0] - 2024-01-01',
    ].join('\n')

    const out = await run({
      existingContent: existing,
      newVersion: 'v1.0.0',
      lastTag: 'v0.9.0',
    })

    expect(out).toContain('[v1.0.0]: https://github.com/owner/repo/compare/v0.9.0...v1.0.0')
    expect(out).toContain('[v0.9.0]: https://github.com/owner/repo/compare/v0.8.0...v0.9.0')
    expect(out).toContain('[v0.8.0]: https://github.com/owner/repo/tree/v0.8.0')
  })
})
