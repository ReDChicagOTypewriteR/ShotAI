export interface ShotAISystemInfo {
  version: string
  isHost: boolean
  canManage: boolean
  port: number
}

export interface ModelCacheCleanupResult {
  removedFiles: number
  removedBytes: number
}

const localHosts = new Set(['localhost', '127.0.0.1', '::1'])

const fallbackInfo: ShotAISystemInfo = {
  version: '1.0.0',
  isHost: localHosts.has(window.location.hostname),
  canManage: localHosts.has(window.location.hostname),
  port: Number(window.location.port || 9090),
}

export async function getShotAISystemInfo(): Promise<ShotAISystemInfo> {
  try {
    const response = await fetch('/shotai/system', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
    if (response.ok) {
      return {
        ...fallbackInfo,
        ...((await response.json()) as Partial<ShotAISystemInfo>),
      }
    }
  } catch {
    // Development and custom static deployments use the local fallback.
  }
  return fallbackInfo
}

export async function cleanupModelCache(): Promise<ModelCacheCleanupResult> {
  const response = await fetch('/shotai/model-cache', {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  const body = await response.text()
  if (!response.ok) {
    let message = '模型临时文件清理失败'
    try {
      message = (JSON.parse(body) as { error?: string }).error || message
    } catch {
      // Keep the friendly fallback when the server returns plain text.
    }
    throw new Error(message)
  }
  return JSON.parse(body) as ModelCacheCleanupResult
}
