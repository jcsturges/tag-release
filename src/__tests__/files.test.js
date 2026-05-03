'use strict'

jest.mock('@actions/core', () => ({ info: jest.fn() }))

const fs = require('fs')
const { updateVersionFiles } = require('../files')

afterEach(() => jest.restoreAllMocks())

// Helper: set up fs spies where only paths ending with `name` exist
function mockOnly(name, content) {
  jest.spyOn(fs, 'existsSync').mockImplementation((p) => p.endsWith(name))
  jest.spyOn(fs, 'readFileSync').mockReturnValue(content)
  jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {})
}

function lastWritten() {
  return fs.writeFileSync.mock.calls[0][1]
}

// ─── package.json ─────────────────────────────────────────────────────────────

describe('package.json', () => {
  test('updates the version field', async () => {
    mockOnly('package.json', JSON.stringify({ name: 'my-app', version: '1.0.0' }))
    await updateVersionFiles('v1.5.0')
    expect(JSON.parse(lastWritten()).version).toBe('1.5.0')
  })

  test('strips the leading v from the version', async () => {
    mockOnly('package.json', JSON.stringify({ version: '0.0.1' }))
    await updateVersionFiles('v2.3.4')
    expect(JSON.parse(lastWritten()).version).toBe('2.3.4')
  })

  test('preserves all other fields', async () => {
    const pkg = { name: 'app', version: '1.0.0', description: 'test', private: true }
    mockOnly('package.json', JSON.stringify(pkg))
    await updateVersionFiles('v1.1.0')
    const written = JSON.parse(lastWritten())
    expect(written.name).toBe('app')
    expect(written.description).toBe('test')
    expect(written.private).toBe(true)
  })
})

// ─── package-lock.json ────────────────────────────────────────────────────────

describe('package-lock.json', () => {
  test('updates top-level version and packages[""] version', async () => {
    const lock = {
      name: 'my-app',
      version: '1.0.0',
      packages: { '': { name: 'my-app', version: '1.0.0' } },
    }
    mockOnly('package-lock.json', JSON.stringify(lock))
    await updateVersionFiles('v2.0.0')
    const written = JSON.parse(lastWritten())
    expect(written.version).toBe('2.0.0')
    expect(written.packages[''].version).toBe('2.0.0')
  })

  test('updates only top-level version when packages[""] is absent', async () => {
    const lock = { name: 'my-app', version: '1.0.0', packages: {} }
    mockOnly('package-lock.json', JSON.stringify(lock))
    await updateVersionFiles('v1.1.0')
    const written = JSON.parse(lastWritten())
    expect(written.version).toBe('1.1.0')
  })
})

// ─── pyproject.toml ───────────────────────────────────────────────────────────

describe('pyproject.toml', () => {
  test('updates version = "..." pattern', async () => {
    mockOnly('pyproject.toml', '[tool.poetry]\nname = "mylib"\nversion = "0.1.0"\n')
    await updateVersionFiles('v0.2.0')
    expect(lastWritten()).toContain('version = "0.2.0"')
    expect(lastWritten()).not.toContain('version = "0.1.0"')
  })

  test("updates version = '...' with single quotes", async () => {
    mockOnly('pyproject.toml', "version = '1.0.0'\n")
    await updateVersionFiles('v1.1.0')
    expect(lastWritten()).toContain('version = "1.1.0"')
  })

  test('does not write when version pattern is not found', async () => {
    mockOnly('pyproject.toml', '[tool.poetry]\nname = "mylib"\n')
    await updateVersionFiles('v1.0.0')
    // existsSync returns true for pyproject.toml but no write should happen
    const writes = fs.writeFileSync.mock.calls.filter((c) => String(c[0]).endsWith('pyproject.toml'))
    expect(writes).toHaveLength(0)
  })
})

// ─── Cargo.toml ───────────────────────────────────────────────────────────────

describe('Cargo.toml', () => {
  test('updates version = "..." in [package] section', async () => {
    mockOnly('Cargo.toml', '[package]\nname = "mycrate"\nversion = "0.1.0"\n')
    await updateVersionFiles('v0.2.0')
    expect(lastWritten()).toContain('version = "0.2.0"')
  })

  test('does not write when version pattern is absent', async () => {
    mockOnly('Cargo.toml', '[package]\nname = "mycrate"\n')
    await updateVersionFiles('v1.0.0')
    const writes = fs.writeFileSync.mock.calls.filter((c) => String(c[0]).endsWith('Cargo.toml'))
    expect(writes).toHaveLength(0)
  })
})

// ─── version.py / _version.py ─────────────────────────────────────────────────

describe('Python version files', () => {
  test('updates __version__ = "..." pattern', async () => {
    jest.spyOn(fs, 'existsSync').mockImplementation((p) => p.endsWith('version.py'))
    jest.spyOn(fs, 'readFileSync').mockReturnValue('__version__ = "1.0.0"\n')
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {})

    await updateVersionFiles('v1.2.0')
    expect(lastWritten()).toContain('__version__ = "1.2.0"')
  })

  test('updates VERSION = "..." pattern', async () => {
    jest.spyOn(fs, 'existsSync').mockImplementation((p) => p.endsWith('version.py'))
    jest.spyOn(fs, 'readFileSync').mockReturnValue("VERSION = '0.9.0'\n")
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {})

    await updateVersionFiles('v1.0.0')
    expect(lastWritten()).toContain('VERSION = "1.0.0"')
  })

  test('tries the next candidate when the first has no matching pattern', async () => {
    // version.py exists but has no recognizable pattern; _version.py does
    jest.spyOn(fs, 'existsSync').mockImplementation((p) =>
      p.endsWith('version.py') || p.endsWith('_version.py')
    )
    jest.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      if (p.endsWith('_version.py')) return '__version__ = "0.1.0"\n'
      return '# no version here\n'
    })
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {})

    await updateVersionFiles('v0.2.0')
    // Should have written to _version.py (the last written file path contains it)
    const writtenPath = String(fs.writeFileSync.mock.calls[0][0])
    expect(writtenPath).toMatch(/_version\.py$/)
    expect(lastWritten()).toContain('__version__ = "0.2.0"')
  })
})

// ─── All files missing ────────────────────────────────────────────────────────

describe('no version files present', () => {
  test('does not write anything and does not throw', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false)
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {})

    await expect(updateVersionFiles('v1.0.0')).resolves.not.toThrow()
    expect(fs.writeFileSync).not.toHaveBeenCalled()
  })
})
