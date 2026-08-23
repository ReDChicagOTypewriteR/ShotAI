const { build } = require('../../package.json')

module.exports = {
  ...build,
  directories: {
    ...build.directories,
    output: 'release/windows',
  },
}
