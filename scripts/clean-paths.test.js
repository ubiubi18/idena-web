const path = require('path')
const {cleanPaths, resolveCleanPath} = require('./clean-paths')

describe('clean paths script', () => {
  const cwd = path.join(path.sep, 'tmp', 'idena-web')

  it('resolves relative clean paths inside the project', () => {
    expect(resolveCleanPath('public/locales/en', cwd)).toBe(
      path.join(cwd, 'public', 'locales', 'en')
    )
  })

  it('rejects absolute paths', () => {
    expect(() => resolveCleanPath(path.join(cwd, 'public'), cwd)).toThrow(
      'absolute path'
    )
  })

  it('rejects parent traversal and project root deletion', () => {
    expect(() => resolveCleanPath('../outside', cwd)).toThrow(
      'outside the project'
    )
    expect(() => resolveCleanPath('.', cwd)).toThrow('outside the project')
  })

  it('removes only validated relative paths', () => {
    const rmSync = jest.fn()

    cleanPaths(['public/locales/en', 'public/locales/de'], {cwd, rmSync})

    expect(rmSync).toHaveBeenCalledWith(
      path.join(cwd, 'public', 'locales', 'en'),
      {
        recursive: true,
        force: true,
      }
    )
    expect(rmSync).toHaveBeenCalledWith(
      path.join(cwd, 'public', 'locales', 'de'),
      {
        recursive: true,
        force: true,
      }
    )
  })
})
