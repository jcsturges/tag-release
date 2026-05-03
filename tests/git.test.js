'use strict'

jest.mock('@actions/exec', () => ({
  getExecOutput: jest.fn(),
}))

const { getExecOutput } = require('@actions/exec')
const {
  gitOutput,
  getLastTag,
  getTagDate,
  getFirstCommit,
  getCommitsSinceRef,
  getAuthorStats,
} = require('../src/git')

const SEP = '\x1f'

beforeEach(() => jest.clearAllMocks())

// ─── gitOutput ───────────────────────────────────────────────────────────────

describe('gitOutput', () => {
  test('returns trimmed stdout on exitCode 0', async () => {
    getExecOutput.mockResolvedValue({ stdout: '  v1.2.3\n', exitCode: 0 })
    expect(await gitOutput(['describe'])).toBe('v1.2.3')
  })

  test('returns null on non-zero exitCode', async () => {
    getExecOutput.mockResolvedValue({ stdout: 'some output', exitCode: 128 })
    expect(await gitOutput(['describe'])).toBeNull()
  })

  test('returns null when stdout is only whitespace', async () => {
    getExecOutput.mockResolvedValue({ stdout: '   \n', exitCode: 0 })
    expect(await gitOutput(['log'])).toBeNull()
  })

  test('returns null when stdout is empty string', async () => {
    getExecOutput.mockResolvedValue({ stdout: '', exitCode: 0 })
    expect(await gitOutput(['log'])).toBeNull()
  })
})

// ─── getLastTag ───────────────────────────────────────────────────────────────

describe('getLastTag', () => {
  test('returns trimmed tag when found', async () => {
    getExecOutput.mockResolvedValue({ stdout: 'v1.5.0\n', exitCode: 0 })
    expect(await getLastTag()).toBe('v1.5.0')
  })

  test('returns null when no tags exist (non-zero exit)', async () => {
    getExecOutput.mockResolvedValue({ stdout: '', exitCode: 128 })
    expect(await getLastTag()).toBeNull()
  })

  test('returns null when stdout is empty', async () => {
    getExecOutput.mockResolvedValue({ stdout: '', exitCode: 0 })
    expect(await getLastTag()).toBeNull()
  })
})

// ─── getTagDate ───────────────────────────────────────────────────────────────

describe('getTagDate', () => {
  test('returns the YYYY-MM-DD portion of an ISO timestamp', async () => {
    getExecOutput.mockResolvedValue({ stdout: '2025-06-15T10:30:00+00:00\n', exitCode: 0 })
    expect(await getTagDate('v1.0.0')).toBe('2025-06-15')
  })

  test('returns null when git log fails', async () => {
    getExecOutput.mockResolvedValue({ stdout: '', exitCode: 128 })
    expect(await getTagDate('v1.0.0')).toBeNull()
  })
})

// ─── getFirstCommit ───────────────────────────────────────────────────────────

describe('getFirstCommit', () => {
  test('returns the first commit SHA', async () => {
    getExecOutput.mockResolvedValue({ stdout: 'abc1234abc1234abc1234\n', exitCode: 0 })
    expect(await getFirstCommit()).toBe('abc1234abc1234abc1234')
  })

  test('returns null on empty repo', async () => {
    getExecOutput.mockResolvedValue({ stdout: '', exitCode: 128 })
    expect(await getFirstCommit()).toBeNull()
  })
})

// ─── getCommitsSinceRef ───────────────────────────────────────────────────────

describe('getCommitsSinceRef', () => {
  test('parses a single commit line into an object', async () => {
    const line = `abc1234${SEP}feat: add thing${SEP}Alice${SEP}alice@x.com${SEP}2025-01-01T00:00:00Z`
    getExecOutput.mockResolvedValue({ stdout: line, exitCode: 0 })

    const commits = await getCommitsSinceRef('v1.0.0')
    expect(commits).toHaveLength(1)
    expect(commits[0]).toEqual({
      hash: 'abc1234',
      subject: 'feat: add thing',
      authorName: 'Alice',
      authorEmail: 'alice@x.com',
      authorDate: '2025-01-01T00:00:00Z',
    })
  })

  test('parses multiple commits', async () => {
    const lines = [
      `aaa${SEP}feat: one${SEP}Alice${SEP}a@x.com${SEP}2025-01-01`,
      `bbb${SEP}fix: two${SEP}Bob${SEP}b@x.com${SEP}2025-01-02`,
    ].join('\n')
    getExecOutput.mockResolvedValue({ stdout: lines, exitCode: 0 })

    const commits = await getCommitsSinceRef('v1.0.0')
    expect(commits).toHaveLength(2)
    expect(commits[0].hash).toBe('aaa')
    expect(commits[1].subject).toBe('fix: two')
  })

  test('returns empty array when there are no commits', async () => {
    getExecOutput.mockResolvedValue({ stdout: '', exitCode: 0 })
    expect(await getCommitsSinceRef('v1.0.0')).toEqual([])
  })

  test('returns empty array on git failure', async () => {
    getExecOutput.mockResolvedValue({ stdout: '', exitCode: 128 })
    expect(await getCommitsSinceRef('v1.0.0')).toEqual([])
  })

  test('passes ref..HEAD range when a ref is given', async () => {
    getExecOutput.mockResolvedValue({ stdout: '', exitCode: 0 })
    await getCommitsSinceRef('v2.0.0')
    const args = getExecOutput.mock.calls[0][1]
    expect(args).toContain('v2.0.0..HEAD')
  })

  test('passes plain HEAD range when ref is null', async () => {
    getExecOutput.mockResolvedValue({ stdout: '', exitCode: 0 })
    await getCommitsSinceRef(null)
    const args = getExecOutput.mock.calls[0][1]
    expect(args).toContain('HEAD')
    expect(args.some((a) => a.includes('..'))).toBe(false)
  })
})

// ─── getAuthorStats ───────────────────────────────────────────────────────────

describe('getAuthorStats', () => {
  test('aggregates commit count, additions, and deletions per author', async () => {
    const output = [
      `COMMIT${SEP}Alice${SEP}alice@example.com`,
      '10\t5\tfile.js',
      '3\t1\tother.js',
      '',
      `COMMIT${SEP}Alice${SEP}alice@example.com`,
      '2\t0\tnew.js',
      '',
      `COMMIT${SEP}Bob${SEP}bob@example.com`,
      '7\t3\tfoo.js',
    ].join('\n')
    getExecOutput.mockResolvedValue({ stdout: output, exitCode: 0 })

    const stats = await getAuthorStats()
    const alice = stats.find((a) => a.email === 'alice@example.com')
    const bob = stats.find((a) => a.email === 'bob@example.com')

    expect(alice.commits).toBe(2)
    expect(alice.additions).toBe(15)  // 10 + 3 + 2
    expect(alice.deletions).toBe(6)   // 5 + 1 + 0
    expect(bob.commits).toBe(1)
    expect(bob.additions).toBe(7)
    expect(bob.deletions).toBe(3)
  })

  test('sorts authors by commit count descending', async () => {
    const output = [
      `COMMIT${SEP}Bob${SEP}bob@example.com`,
      '1\t0\ta.js',
      '',
      `COMMIT${SEP}Alice${SEP}alice@example.com`,
      '1\t0\tb.js',
      '',
      `COMMIT${SEP}Alice${SEP}alice@example.com`,
      '1\t0\tc.js',
    ].join('\n')
    getExecOutput.mockResolvedValue({ stdout: output, exitCode: 0 })

    const stats = await getAuthorStats()
    expect(stats[0].email).toBe('alice@example.com')
    expect(stats[1].email).toBe('bob@example.com')
  })

  test('ignores binary-file lines (dash values) in numstat', async () => {
    const output = [
      `COMMIT${SEP}Alice${SEP}alice@example.com`,
      '-\t-\tbinary.png',
      '5\t2\tregular.js',
    ].join('\n')
    getExecOutput.mockResolvedValue({ stdout: output, exitCode: 0 })

    const stats = await getAuthorStats()
    expect(stats[0].additions).toBe(5)
    expect(stats[0].deletions).toBe(2)
  })

  test('handles commits with zero additions (pure deletion commits)', async () => {
    const output = [
      `COMMIT${SEP}Alice${SEP}alice@example.com`,
      '0\t8\tdeleted-content.js',  // 0 additions — exercises the || 0 fallback on line 69
    ].join('\n')
    getExecOutput.mockResolvedValue({ stdout: output, exitCode: 0 })

    const stats = await getAuthorStats()
    expect(stats[0].additions).toBe(0)
    expect(stats[0].deletions).toBe(8)
  })

  test('returns empty array when git returns no output', async () => {
    getExecOutput.mockResolvedValue({ stdout: '', exitCode: 0 })
    expect(await getAuthorStats()).toEqual([])
  })

  test('returns empty array on git failure', async () => {
    getExecOutput.mockResolvedValue({ stdout: '', exitCode: 128 })
    expect(await getAuthorStats()).toEqual([])
  })
})
