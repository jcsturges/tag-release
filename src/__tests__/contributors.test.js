'use strict'

jest.mock('../git', () => ({
  getAuthorStats: jest.fn(),
}))

const fs = require('fs')
const { getAuthorStats } = require('../git')
const { updateContributors } = require('../contributors')

afterEach(() => {
  jest.clearAllMocks()
  jest.restoreAllMocks()
})

function setup() {
  let written = ''
  jest.spyOn(fs, 'writeFileSync').mockImplementation((_path, content) => { written = content })
  return () => written
}

// ─── Normal output ────────────────────────────────────────────────────────────

describe('with authors present', () => {
  test('writes CONTRIBUTORS.md with a markdown table', async () => {
    getAuthorStats.mockResolvedValue([
      { name: 'Alice', email: 'alice@example.com', commits: 42, additions: 1200, deletions: 300 },
      { name: 'Bob', email: 'bob@example.com', commits: 10, additions: 500, deletions: 100 },
    ])
    const getWritten = setup()
    await updateContributors()
    const out = getWritten()

    expect(out).toContain('# Contributors')
    expect(out).toContain('| Author | Email | Commits | Lines Added | Lines Removed |')
    expect(out).toContain('Alice')
    expect(out).toContain('alice@example.com')
    expect(out).toContain('Bob')
    expect(out).toContain('bob@example.com')
  })

  test('formats large numbers with commas (en-US locale)', async () => {
    getAuthorStats.mockResolvedValue([
      { name: 'Dev', email: 'd@x.com', commits: 1000, additions: 12345, deletions: 6789 },
    ])
    const getWritten = setup()
    await updateContributors()
    const out = getWritten()

    expect(out).toContain('1,000')
    expect(out).toContain('+12,345')
    expect(out).toContain('-6,789')
  })

  test('includes the auto-generated date note', async () => {
    getAuthorStats.mockResolvedValue([
      { name: 'Dev', email: 'd@x.com', commits: 1, additions: 5, deletions: 2 },
    ])
    const getWritten = setup()
    await updateContributors()
    const today = new Date().toISOString().split('T')[0]
    expect(getWritten()).toContain(`Last updated ${today}`)
  })

  test('preserves author ordering from getAuthorStats (already sorted by commits)', async () => {
    getAuthorStats.mockResolvedValue([
      { name: 'Top', email: 'top@x.com', commits: 99, additions: 0, deletions: 0 },
      { name: 'Mid', email: 'mid@x.com', commits: 50, additions: 0, deletions: 0 },
      { name: 'Low', email: 'low@x.com', commits: 1, additions: 0, deletions: 0 },
    ])
    const getWritten = setup()
    await updateContributors()
    const out = getWritten()

    const topPos = out.indexOf('Top')
    const midPos = out.indexOf('Mid')
    const lowPos = out.indexOf('Low')
    expect(topPos).toBeLessThan(midPos)
    expect(midPos).toBeLessThan(lowPos)
  })
})

// ─── Empty author list ────────────────────────────────────────────────────────

describe('with no authors', () => {
  test('does not write the file', async () => {
    getAuthorStats.mockResolvedValue([])
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {})
    await updateContributors()
    expect(fs.writeFileSync).not.toHaveBeenCalled()
  })
})
