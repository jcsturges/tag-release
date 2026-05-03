'use strict'

jest.mock('../src/git', () => ({
  getLastTag: jest.fn(),
  getTagDate: jest.fn(),
  getCommitsSinceRef: jest.fn(),
}))

const { getLastTag, getTagDate, getCommitsSinceRef } = require('../src/git')
const { parseConventionalCommit, highestBump, calculateVersion } = require('../src/version')

beforeEach(() => jest.clearAllMocks())

// ─── parseConventionalCommit ──────────────────────────────────────────────────

describe('parseConventionalCommit', () => {
  test.each([
    // Breaking changes
    ['feat!: redesign auth API',                 'major'],
    ['fix!: change error response format',       'major'],
    ['feat(auth)!: redesign token flow',         'major'],
    ['chore(deps)!: drop Node 16',               'major'],
    ['anything BREAKING CHANGE here',            'major'],
    ['anything BREAKING-CHANGE here',            'major'],
    // Minor bumps
    ['feat: add OAuth login',                    'minor'],
    ['feat(ui): add dark mode',                  'minor'],
    ['feat(api): new /health endpoint',          'minor'],
    // Patch bumps
    ['fix: null crash on empty body',            'patch'],
    ['fix(db): connection leak',                 'patch'],
    ['perf: cache query results',                'patch'],
    ['perf(api): reduce allocations',            'patch'],
    // No bump — explicit no-bump types
    ['chore: update deps',                       null],
    ['chore(ci): bump action versions',          null],
    ['docs: fix typo in README',                 null],
    ['style: reformat with prettier',            null],
    ['test: add unit tests',                     null],
    ['tests: add integration tests',             null],
    ['ci: update workflow trigger',              null],
    ['build: bump node version',                 null],
    ['refactor: extract helper function',        null],
    // No bump — unknown type (conservative)
    ['bump: version to 2.0',                     null],
    ['update: dependency',                       null],
    // Edge cases
    ['',                                         null],
    [null,                                       null],
  ])('"%s" → %s', (subject, expected) => {
    expect(parseConventionalCommit(subject)).toBe(expected)
  })
})

// ─── highestBump ──────────────────────────────────────────────────────────────

describe('highestBump', () => {
  test('returns null for empty commit list', () => {
    expect(highestBump([])).toBeNull()
  })

  test('returns null when all commits are no-bump types', () => {
    expect(highestBump([
      { subject: 'chore: update deps' },
      { subject: 'docs: fix typo' },
      { subject: 'ci: update workflow' },
    ])).toBeNull()
  })

  test('returns patch for only fix commits', () => {
    expect(highestBump([
      { subject: 'fix: null crash' },
      { subject: 'fix: memory leak' },
    ])).toBe('patch')
  })

  test('returns minor when a feat commit is present', () => {
    expect(highestBump([
      { subject: 'fix: null crash' },
      { subject: 'feat: add button' },
      { subject: 'chore: update deps' },
    ])).toBe('minor')
  })

  test('returns major when a breaking change is present', () => {
    expect(highestBump([
      { subject: 'fix: small fix' },
      { subject: 'feat: add thing' },
      { subject: 'feat!: redesign API' },
    ])).toBe('major')
  })

  test('short-circuits on first major commit', () => {
    // Remaining commits after a major should not be processed
    const commits = [
      { subject: 'feat!: breaking' },
      { subject: 'feat: another' },
    ]
    expect(highestBump(commits)).toBe('major')
  })

  test('perf commits count as patch', () => {
    expect(highestBump([{ subject: 'perf: cache results' }])).toBe('patch')
  })
})

// ─── calculateVersion ────────────────────────────────────────────────────────

describe('calculateVersion', () => {
  test('first release with no previous tag and feat commit → v0.1.0', async () => {
    getLastTag.mockResolvedValue(null)
    getCommitsSinceRef.mockResolvedValue([{ subject: 'feat: initial feature' }])

    const result = await calculateVersion('auto')
    expect(result.newVersion).toBe('v0.1.0')
    expect(result.lastTag).toBeNull()
    expect(result.commits).toHaveLength(1)
  })

  test('first release with no previous tag and fix commit → v0.0.1', async () => {
    getLastTag.mockResolvedValue(null)
    getCommitsSinceRef.mockResolvedValue([{ subject: 'fix: correct spelling' }])

    const { newVersion } = await calculateVersion('auto')
    expect(newVersion).toBe('v0.0.1')
  })

  test('same-day tag always forces patch regardless of commit types', async () => {
    const today = new Date().toISOString().split('T')[0]
    getLastTag.mockResolvedValue('v1.0.0')
    getTagDate.mockResolvedValue(today)
    getCommitsSinceRef.mockResolvedValue([{ subject: 'feat!: huge breaking change' }])

    const result = await calculateVersion('auto')
    expect(result.newVersion).toBe('v1.0.1')
    expect(result.bumpReason).toMatch(/same-day/)
  })

  test('same-day guard also overrides explicit version-type input', async () => {
    const today = new Date().toISOString().split('T')[0]
    getLastTag.mockResolvedValue('v2.0.0')
    getTagDate.mockResolvedValue(today)
    getCommitsSinceRef.mockResolvedValue([])

    const result = await calculateVersion('major')
    expect(result.newVersion).toBe('v2.0.1')
  })

  test('explicit "major" bumps major regardless of commits', async () => {
    getLastTag.mockResolvedValue('v1.2.3')
    getTagDate.mockResolvedValue('2020-01-01')
    getCommitsSinceRef.mockResolvedValue([{ subject: 'fix: tiny fix' }])

    const result = await calculateVersion('major')
    expect(result.newVersion).toBe('v2.0.0')
    expect(result.bumpReason).toBe('explicit input: major')
  })

  test('explicit "minor" bumps minor', async () => {
    getLastTag.mockResolvedValue('v1.2.3')
    getTagDate.mockResolvedValue('2020-01-01')
    getCommitsSinceRef.mockResolvedValue([])

    const { newVersion } = await calculateVersion('minor')
    expect(newVersion).toBe('v1.3.0')
  })

  test('explicit "patch" bumps patch', async () => {
    getLastTag.mockResolvedValue('v2.0.0')
    getTagDate.mockResolvedValue('2020-01-01')
    getCommitsSinceRef.mockResolvedValue([])

    const { newVersion } = await calculateVersion('patch')
    expect(newVersion).toBe('v2.0.1')
  })

  test('auto with breaking commit → major', async () => {
    getLastTag.mockResolvedValue('v1.0.0')
    getTagDate.mockResolvedValue('2020-01-01')
    getCommitsSinceRef.mockResolvedValue([{ subject: 'feat!: redesign' }])

    const result = await calculateVersion('auto')
    expect(result.newVersion).toBe('v2.0.0')
    expect(result.bumpReason).toMatch(/major/)
  })

  test('auto with feat commit → minor', async () => {
    getLastTag.mockResolvedValue('v1.0.0')
    getTagDate.mockResolvedValue('2020-01-01')
    getCommitsSinceRef.mockResolvedValue([{ subject: 'feat: add thing' }])

    const { newVersion } = await calculateVersion('auto')
    expect(newVersion).toBe('v1.1.0')
  })

  test('auto with no bumpable commits defaults to patch', async () => {
    getLastTag.mockResolvedValue('v1.5.0')
    getTagDate.mockResolvedValue('2020-01-01')
    getCommitsSinceRef.mockResolvedValue([
      { subject: 'chore: update deps' },
      { subject: 'docs: fix typo' },
    ])

    const result = await calculateVersion('auto')
    expect(result.newVersion).toBe('v1.5.1')
    expect(result.bumpReason).toMatch(/defaulting to patch/)
  })

  test('unknown version-type input falls through to auto', async () => {
    getLastTag.mockResolvedValue('v1.0.0')
    getTagDate.mockResolvedValue('2020-01-01')
    getCommitsSinceRef.mockResolvedValue([{ subject: 'feat: something' }])

    const { newVersion } = await calculateVersion('invalid-type')
    expect(newVersion).toBe('v1.1.0')
  })

  test('strips leading v from existing tag before incrementing', async () => {
    getLastTag.mockResolvedValue('v3.4.5')
    getTagDate.mockResolvedValue('2020-01-01')
    getCommitsSinceRef.mockResolvedValue([])

    const { newVersion } = await calculateVersion('patch')
    expect(newVersion).toBe('v3.4.6')
  })
})
