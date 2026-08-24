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
        'LICENSE.ollama.txt',
        'SHOTAI_OLLAMA_RUNTIME_INFO.txt',
      ],
    },
    {
      from: 'vendor/stable-diffusion.cpp/linux',
      to: 'runtime/image',
      filter: [
        'sd-server',
        'LICENSE.stable-diffusion.cpp.txt',
        'SHOTAI_RUNTIME_INFO.txt',
      ],
    },
  ],
  linux: {
    ...build.linux,
    artifactName:
      'ShotAI-${version}-Ubuntu-22.04-x86_64-Full-Ollama-CUDA.${ext}',
  },
}
