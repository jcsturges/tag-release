"use strict";

jest.mock("@actions/core", () => ({ info: jest.fn() }));

const fs = require("fs");
const { updateReadmeBadge } = require("../src/readme");

afterEach(() => jest.restoreAllMocks());

function setup(content) {
  let written = "";
  jest.spyOn(fs, "existsSync").mockReturnValue(content !== null);
  if (content !== null) {
    jest.spyOn(fs, "readFileSync").mockReturnValue(content);
  }
  jest.spyOn(fs, "writeFileSync").mockImplementation((_path, c) => {
    written = c;
  });
  return () => written;
}

const OWNER = "myorg";
const REPO = "myrepo";
const EXISTING_BADGE =
  "[![Version](https://img.shields.io/badge/version-v0.9.0-blue)](https://github.com/myorg/myrepo/releases/tag/v0.9.0)";

// ─── File missing ─────────────────────────────────────────────────────────────

describe("README.md does not exist", () => {
  test("does nothing", async () => {
    setup(null);
    await updateReadmeBadge("v1.0.0", OWNER, REPO);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});

// ─── Badge replacement ────────────────────────────────────────────────────────

describe("existing version badge", () => {
  test("replaces the badge with the new version", async () => {
    const content = `# My Project\n\n${EXISTING_BADGE}\n\nSome content\n`;
    const getWritten = setup(content);
    await updateReadmeBadge("v1.0.0", OWNER, REPO);
    const out = getWritten();
    expect(out).toContain("version-v1.0.0-blue");
    expect(out).not.toContain("version-v0.9.0-blue");
  });

  test("badge links to the correct new release URL", async () => {
    const getWritten = setup(`# Title\n\n${EXISTING_BADGE}\n`);
    await updateReadmeBadge("v2.0.0", OWNER, REPO);
    expect(getWritten()).toContain("https://github.com/myorg/myrepo/releases/tag/v2.0.0");
  });

  test("does not duplicate the badge", async () => {
    const getWritten = setup(`# Title\n\n${EXISTING_BADGE}\n`);
    await updateReadmeBadge("v1.1.0", OWNER, REPO);
    const out = getWritten();
    const count = (out.match(/img\.shields\.io\/badge\/version/g) || []).length;
    expect(count).toBe(1);
  });
});

// ─── Badge insertion – heading present ───────────────────────────────────────

describe("no existing badge, README has a # heading", () => {
  test("inserts badge on the line after the heading", async () => {
    const getWritten = setup("# My Project\n\nSome content here.\n");
    await updateReadmeBadge("v1.0.0", OWNER, REPO);
    const out = getWritten();
    expect(out).toContain("![Version]");
    const headingPos = out.indexOf("# My Project");
    const badgePos = out.indexOf("[![Version]");
    expect(badgePos).toBeGreaterThan(headingPos);
  });

  test("existing content after the heading is preserved", async () => {
    const getWritten = setup("# My Project\n\nSome content here.\n");
    await updateReadmeBadge("v1.0.0", OWNER, REPO);
    expect(getWritten()).toContain("Some content here.");
  });
});

// ─── Badge insertion – no heading ────────────────────────────────────────────

describe("no existing badge, README has no # heading", () => {
  test("prepends the badge at the top", async () => {
    const getWritten = setup("Just some plain text with no heading.\n");
    await updateReadmeBadge("v1.0.0", OWNER, REPO);
    const out = getWritten();
    expect(out.startsWith("[![Version]")).toBe(true);
  });

  test("original content is preserved after the badge", async () => {
    const getWritten = setup("Just some plain text with no heading.\n");
    await updateReadmeBadge("v1.0.0", OWNER, REPO);
    expect(getWritten()).toContain("Just some plain text");
  });
});

// ─── Shields.io dash encoding ─────────────────────────────────────────────────

describe("shields.io dash encoding", () => {
  test("hyphens in the version string are doubled for shields.io", async () => {
    const getWritten = setup("# Title\n");
    await updateReadmeBadge("v1.0.0-beta.1", OWNER, REPO);
    // shields.io requires hyphens in labels to be doubled
    expect(getWritten()).toContain("v1.0.0--beta.1");
  });
});
