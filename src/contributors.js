'use strict'

const fs = require('fs')
const path = require('path')
const { getAuthorStats } = require('./git')

function formatNum(n) {
  return n.toLocaleString('en-US')
}

async function updateContributors() {
  const authors = await getAuthorStats()
  if (!authors.length) return

  const today = new Date().toISOString().split('T')[0]

  let content = `# Contributors\n\n`
  content += `> Auto-generated from git history. Last updated ${today}.\n\n`
  content += `| Author | Email | Commits | Lines Added | Lines Removed |\n`
  content += `|--------|-------|--------:|------------:|--------------:|\n`

  for (const { name, email, commits, additions, deletions } of authors) {
    content += `| ${name} | ${email} | ${formatNum(commits)} | +${formatNum(additions)} | -${formatNum(deletions)} |\n`
  }

  content += `\n`

  fs.writeFileSync(path.join(process.cwd(), 'CONTRIBUTORS.md'), content, 'utf-8')
}

module.exports = { updateContributors }
