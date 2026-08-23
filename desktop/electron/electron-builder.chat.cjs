const { build } = require('../../package.json')

module.exports = {
  ...build,
  extraResources: [
    ...build.extraResources,
    {
      from: 'vendor/ollama/windows',
      to: 'runtime/ollama',
      filter: [
        'ollama.exe',
        'LICENSE.ollama.txt',
        'SHOTAI_OLLAMA_RUNTIME_INFO.txt',
        'lib/ollama/*.dll',
        'lib/ollama/*.exe',
        'lib/ollama/cuda_v12/**/*',
      ],
    },
  ],
  win: {
    ...build.win,
    artifactName: 'ShotAI-${version}-Windows-${arch}-Chat-CUDA12-Setup.${ext}',
  },
}
