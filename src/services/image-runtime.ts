export interface ImageRuntimeStatus {
  available: boolean
  serviceOnline: boolean
  serviceStatus: number
  runtimeFound: boolean
  modelConfigured: boolean
  modelLabel: string
  modelFiles: string[]
  modelDirectory: string
  runtimeDirectory: string
}

interface ImageGenerationResponse {
  data?: Array<{
    b64_json?: string
    url?: string
  }>
  error?: string | { message?: string }
}

const defaultStatus: ImageRuntimeStatus = {
  available: false,
  serviceOnline: false,
  serviceStatus: 0,
  runtimeFound: false,
  modelConfigured: false,
  modelLabel: 'FLUX.2 Klein 4B',
  modelFiles: [],
  modelDirectory: 'models/image',
  runtimeDirectory: 'runtime/image',
}

function getResponseError(
  body: ImageGenerationResponse | undefined,
  fallback: string,
) {
  if (typeof body?.error === 'string') return body.error
  if (body?.error?.message) return body.error.message
  return fallback
}

export async function getImageRuntimeStatus(): Promise<ImageRuntimeStatus> {
  try {
    const response = await fetch('/image-runtime/status', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
    if (response.ok) {
      return {
        ...defaultStatus,
        ...((await response.json()) as Partial<ImageRuntimeStatus>),
      }
    }
  } catch {
    // Static/Nginx deployments may not expose ShotAI's richer status route.
  }

  try {
    const response = await fetch('/image/v1/models', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
    if (response.ok) {
      return {
        ...defaultStatus,
        available: true,
        serviceOnline: true,
        serviceStatus: response.status,
        runtimeFound: true,
        modelConfigured: true,
      }
    }
  } catch {
    // Keep the actionable offline state below.
  }

  return defaultStatus
}

function getUploadError(responseText: string, fallback: string) {
  try {
    const body = JSON.parse(responseText) as { error?: string }
    return body.error || fallback
  } catch {
    return fallback
  }
}

export function uploadImageModelFile(
  file: File,
  onProgress?: (progress: number) => void,
) {
  return new Promise<{ fileName: string; size: number }>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open(
      'PUT',
      `/image-runtime/models/${encodeURIComponent(file.name)}`,
    )
    request.responseType = 'text'
    request.setRequestHeader('Content-Type', 'application/octet-stream')
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100))
      }
    })
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        try {
          resolve(JSON.parse(request.responseText))
        } catch {
          resolve({ fileName: file.name, size: file.size })
        }
        return
      }
      reject(
        new Error(
          getUploadError(request.responseText, '模型文件没有保存成功'),
        ),
      )
    })
    request.addEventListener('error', () => {
      reject(new Error('无法连接主机，请检查 ShotAI 是否仍在运行'))
    })
    request.addEventListener('abort', () => {
      reject(new DOMException('上传已取消', 'AbortError'))
    })
    request.send(file)
  })
}

export async function deleteImageModelFile(fileName: string) {
  const response = await fetch(
    `/image-runtime/models/${encodeURIComponent(fileName)}`,
    {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    },
  )
  const body = await response.text()
  if (!response.ok) {
    throw new Error(getUploadError(body, '图片模型没有删除成功'))
  }
}

export async function restartImageRuntime() {
  const response = await fetch('/image-runtime/restart', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  const body = await response.text()
  if (!response.ok) {
    throw new Error(getUploadError(body, '图片服务没有重新载入成功'))
  }
  return JSON.parse(body) as {
    accepted: boolean
    restartRequired?: boolean
    message?: string
  }
}

export async function generateImageWithLocalRuntime(
  prompt: string,
  options: {
    signal?: AbortSignal
    width: number
    height: number
    steps?: number
    cfgScale?: number
    model?: string
  },
) {
  let response: Response
  try {
    response = await fetch('/image/v1/images/generations', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || 'local-image',
        prompt,
        size: `${options.width}x${options.height}`,
        width: options.width,
        height: options.height,
        n: 1,
        response_format: 'b64_json',
        steps: options.steps ?? 4,
        cfg_scale: options.cfgScale ?? 1,
      }),
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error('无法连接图片创作服务，请重新启动 ShotAI')
  }

  let body: ImageGenerationResponse | undefined
  try {
    body = (await response.json()) as ImageGenerationResponse
  } catch {
    // The error below explains malformed or empty responses without technical terms.
  }

  if (!response.ok) {
    throw new Error(
      getResponseError(body, '图片没有生成成功，请检查图片模型后重新尝试'),
    )
  }

  const item = body?.data?.[0]
  if (item?.b64_json) {
    return {
      dataUrl: item.b64_json.startsWith('data:')
        ? item.b64_json
        : `data:image/png;base64,${item.b64_json}`,
    }
  }
  if (item?.url) {
    return { dataUrl: item.url }
  }
  throw new Error('图片服务没有返回图片，请重新启动图片服务后再试')
}
