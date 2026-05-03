'use strict'

const fs = require('fs')
const { updateReleaseMd } = require('../release')

afterEach(() => jest.restoreAllMocks())

function setup() {
  let written = ''
  jest.spyOn(fs, 'writeFileSync').mockImplementation((_path, content) => { written = content })
  return () => written
}

const OWNER = 'owner'
const REPO = 'repo'
const REPOURL = `https://github.com/${OWNER}/${REPO}`

const mkCommit = (subject, hash = 'aabb1122ccdd3344') => ({ subject, hash })

// ─── Commit grouping ──────────────────────────────────────────────────────────

describe('commit grouping', () => {
  test('feat!: goes to Breaking Changes', async () => {
    const getWritten = setup()
    await updateReleaseMd('v2.0.0', 'v1.0.0', [mkCommit('feat!: redesign auth')], OWNER, REPO)
    expect(getWritten()).toContain('Breaking Changes')
    expect(getWritten()).toContain('feat!: redesign auth')
  })

  test('BREAKING CHANGE keyword goes to Breaking Changes', async () => {
    const getWritten = setup()
    await updateReleaseMd(
      'v2.0.0', 'v1.0.0',
      [mkCommit('feat: remove old endpoint\n\nBREAKING CHANGE: endpoint removed')],
      OWNER, REPO,
    )
    expect(getWritten()).toContain('Breaking Changes')
  })

  test('BREAKING-CHANGE (with hyphen) goes to Breaking Changes', async () => {
    const getWritten = setup()
    await updateReleaseMd(
      'v2.0.0', 'v1.0.0',
      [mkCommit('refactor: BREAKING-CHANGE old API removed')],
      OWNER, REPO,
    )
    expect(getWritten()).toContain('Breaking Changes')
  })

  test('feat: goes to Features', async () => {
    const getWritten = setup()
    await updateReleaseMd('v1.1.0', 'v1.0.0', [mkCommit('feat: add OAuth login')], OWNER, REPO)
    expect(getWritten()).toContain('Features')
    expect(getWritten()).toContain('feat: add OAuth login')
  })

  test('fix: goes to Bug Fixes & Changes', async () => {
    const getWritten = setup()
    await updateReleaseMd('v1.0.1', 'v1.0.0', [mkCommit('fix: null crash')], OWNER, REPO)
    expect(getWritten()).toContain('Bug Fixes')
    expect(getWritten()).toContain('fix: null crash')
  })

  test('perf: goes to Bug Fixes & Changes', async () => {
    const getWritten = setup()
    await updateReleaseMd('v1.0.1', 'v1.0.0', [mkCommit('perf: cache results')], OWNER, REPO)
    expect(getWritten()).toContain('Bug Fixes')
  })

  test.each([
    'chore: update deps',
    'docs: fix typo',
    'style: reformat',
    'test: add tests',
    'tests: more coverage',
    'ci: update workflow',
    'build: bump node',
    'refactor: extract helper',
  ])('"%s" goes to Maintenance', async (subject) => {
    const getWritten = setup()
    await updateReleaseMd('v1.0.1', 'v1.0.0', [mkCommit(subject)], OWNER, REPO)
    expect(getWritten()).toContain('Maintenance')
  })

  test('unknown commit type is a catch-all into Bug Fixes & Changes', async () => {
    const getWritten = setup()
    await updateReleaseMd('v1.0.1', 'v1.0.0', [mkCommit('bump: version')], OWNER, REPO)
    expect(getWritten()).toContain('Bug Fixes')
  })
})

// ─── Short SHA links ─────────────────────────────────────────────────────────

describe('commit links', () => {
  test('each entry contains the 7-char short SHA as a hyperlink', async () => {
    const getWritten = setup()
    const hash = 'deadbeef12345678'
    await updateReleaseMd('v1.0.0', null, [mkCommit('feat: thing', hash)], OWNER, REPO)
    const out = getWritten()
    expect(out).toContain('deadbee') // first 7 chars
    expect(out).toContain(`${REPOURL}/commit/${hash}`)
  })
})

// ─── Compare URL ─────────────────────────────────────────────────────────────

describe('changelog URL', () => {
  test('uses compare URL when lastTag is provided', async () => {
    const getWritten = setup()
    await updateReleaseMd('v1.1.0', 'v1.0.0', [], OWNER, REPO)
    expect(getWritten()).toContain(`${REPOURL}/compare/v1.0.0...v1.1.0`)
  })

  test('uses commits URL when there is no lastTag', async () => {
    const getWritten = setup()
    await updateReleaseMd('v1.0.0', null, [], OWNER, REPO)
    expect(getWritten()).toContain(`${REPOURL}/commits/v1.0.0`)
    expect(getWritten()).toContain('initial...v1.0.0')
  })
})

// ─── Empty commits fallback ───────────────────────────────────────────────────

describe('empty commits list', () => {
  test('renders a generic Changes section with "Minor updates"', async () => {
    const getWritten = setup()
    await updateReleaseMd('v1.0.0', null, [], OWNER, REPO)
    expect(getWritten()).toContain('## Changes')
    expect(getWritten()).toContain('- Minor updates')
  })

  test('does not render any category headers when commits is empty', async () => {
    const getWritten = setup()
    await updateReleaseMd('v1.0.0', null, [], OWNER, REPO)
    const out = getWritten()
    expect(out).not.toContain('Breaking Changes')
    expect(out).not.toContain('Features')
    expect(out).not.toContain('Bug Fixes')
    expect(out).not.toContain('Maintenance')
  })
})

// ─── Header content ───────────────────────────────────────────────────────────

describe('file header', () => {
  test('contains the version in the title', async () => {
    const getWritten = setup()
    await updateReleaseMd('v3.1.4', null, [], OWNER, REPO)
    expect(getWritten()).toContain('# Release v3.1.4')
  })

  test('contains today\'s date', async () => {
    const getWritten = setup()
    await updateReleaseMd('v1.0.0', null, [], OWNER, REPO)
    const today = new Date().toISOString().split('T')[0]
    expect(getWritten()).toContain(today)
  })
})
