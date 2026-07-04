#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

function resolveCleanPath(entry, cwd = process.cwd()) {
  if (typeof entry !== 'string' || !entry.trim()) {
    throw new Error('Clean path must be a non-empty relative path')
  }

  if (path.isAbsolute(entry)) {
    throw new Error(`Refusing to clean absolute path: ${entry}`)
  }

  const targetPath = path.resolve(cwd, entry)
  const relativePath = path.relative(cwd, targetPath)

  if (
    !relativePath ||
    relativePath.startsWith('..') ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Refusing to clean path outside the project: ${entry}`)
  }

  return targetPath
}

function cleanPaths(paths, {cwd = process.cwd(), rmSync = fs.rmSync} = {}) {
  if (paths.length === 0) {
    throw new Error('Usage: node scripts/clean-paths.js <path> [path...]')
  }

  for (const entry of paths) {
    rmSync(resolveCleanPath(entry, cwd), {
      recursive: true,
      force: true,
    })
  }
}

function main(paths = process.argv.slice(2)) {
  try {
    cleanPaths(paths)
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = {
  cleanPaths,
  resolveCleanPath,
}
