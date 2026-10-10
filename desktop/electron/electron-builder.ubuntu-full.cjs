const { build } = require('../../package.json')

module.exports = {
  ...build,
  directories: {
    ...build.directories,
    output: 'release/ubuntu',
  },
  extraResources: [
    ...build.extraResources,
    {
      from: 'vendor/ollama/linux',
      to: 'runtime/ollama',
      filter: [
        'bin/ollama',
        'lib/ollama/**/*',
        'lib/ollama/cuda_v12/**/*',
        '!lib/ollama/cuda_v13/**',
        '!lib/ollama/cuda_v13',
        '!lib/ollama/vulkan/**',
        '!lib/ollama/vulkan',
        'LICENSE.ollama.txt',
        'SHOTAI_OLLAMA_RUNTIME_INFO.txt',
      ],
    },
  ],
  linux: {
    ...build.linux,
    artifactName:
      'ShotAI-${version}-Ubuntu-22.04-x86_64-Ollama-CUDA12.${ext}',
  },
}
