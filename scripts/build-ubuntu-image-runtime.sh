#!/usr/bin/env bash
set -euo pipefail

project_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_tag="master-827-97d2990"
source_commit="97d2990807fe6d558e395f8764198d7c7e7b411c"
cuda_image="nvidia/cuda:12.4.1-devel-ubuntu22.04"
build_directory="$(mktemp -d)"
build_directory="$(cd "${build_directory}" && pwd -P)"
source_directory="${build_directory}/stable-diffusion.cpp"
output_directory="${project_directory}/vendor/stable-diffusion.cpp/linux"
container_name="shotai-sdcpp-build-$$"

cleanup() {
  docker rm --force "${container_name}" >/dev/null 2>&1 || true
  rm -rf "${build_directory}"
}
trap cleanup EXIT

git clone --branch "${source_tag}" --depth 1 --recurse-submodules \
  https://github.com/leejet/stable-diffusion.cpp.git "${source_directory}"

actual_commit="$(git -C "${source_directory}" rev-parse HEAD)"
if [[ "${actual_commit}" != "${source_commit}" ]]; then
  echo "stable-diffusion.cpp commit mismatch: ${actual_commit}" >&2
  exit 1
fi

mkdir -p "${output_directory}"

docker create --platform linux/amd64 --name "${container_name}" \
  "${cuda_image}" bash -lc '
    set -euo pipefail
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y --no-install-recommends build-essential ca-certificates cmake ninja-build
    cmake -S /src -B /tmp/sdcpp-build -G Ninja \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_CUDA_ARCHITECTURES=70 \
      -DGGML_NATIVE=OFF \
      -DSD_CUDA=ON \
      -DSD_BUILD_EXAMPLES=ON \
      -DSD_BUILD_SHARED_LIBS=OFF \
      -DSD_SERVER_BUILD_FRONTEND=OFF \
      -DSD_WEBP=OFF \
      -DSD_WEBM=OFF
    cmake --build /tmp/sdcpp-build --target sd-server --parallel "$(nproc)"
    readelf -h /tmp/sdcpp-build/bin/sd-server
    ldd /tmp/sdcpp-build/bin/sd-server
  '
docker cp "${source_directory}/." "${container_name}:/src"
docker start --attach "${container_name}"
docker cp "${container_name}:/tmp/sdcpp-build/bin/sd-server" \
  "${output_directory}/sd-server"

cp "${source_directory}/LICENSE" \
  "${output_directory}/LICENSE.stable-diffusion.cpp.txt"
chmod 0755 "${output_directory}/sd-server"

echo "Ubuntu image runtime built at ${output_directory}/sd-server"
