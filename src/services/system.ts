export interface ShotAISystemInfo {
  version: string
  platform: string
  isHost: boolean
  canManage: boolean
  port: number
}

export interface ModelCacheCleanupResult {
  removedFiles: number
  removedBytes: number
}

export interface MonitorClient {
  ip: string
  host: boolean
  firstSeen: number
  lastSeen: number
  userAgent: string
}

export interface MonitorSnapshot {
  generatedAt: number
  onlineCount: number
  clients: MonitorClient[]
  host: {
    name: string
    platform: string
    release: string
    uptimeSeconds: number
    serverUptimeSeconds: number
  }
  performance: {
    cpu: { usagePercent: number; cores: number }
    memory: { usedBytes: number; totalBytes: number; usagePercent: number }
    disk: null | { usedBytes: number; totalBytes: number; usagePercent: number }
    gpu: null | {
      name: string
      usagePercent: number
      memoryUsedBytes: number
      memoryTotalBytes: number
      temperatureCelsius: number
    }
    process: { memoryBytes: number; requestCount: number }
  }
}

async function parseSystemResponse<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    let message = fallback
    try {
      message = (JSON.parse(text) as { error?: string }).error || fallback
    } catch {
      // Keep the friendly fallback for an empty or non-JSON response.
    }
    throw new Error(message)
  }
  return JSON.parse(text) as T
}

export async function getMonitorSession(): Promise<{ authenticated: boolean; username: string }> {
  const response = await fetch('/shotai/monitor/session', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  return parseSystemResponse(response, '无法检查管理员登录状态')
}

export async function loginMonitor(username: string, password: string) {
  const response = await fetch('/shotai/monitor/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  return parseSystemResponse<{ authenticated: boolean; username: string }>(
    response,
    '监控平台登录失败',
  )
}

export async function logoutMonitor() {
  const response = await fetch('/shotai/monitor/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  return parseSystemResponse<{ authenticated: boolean }>(response, '退出登录失败')
}

export async function getMonitorSnapshot(): Promise<MonitorSnapshot> {
  const response = await fetch('/shotai/monitor/snapshot', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  return parseSystemResponse(response, '无法读取主机运行状态')
}

const localHosts = new Set(['localhost', '127.0.0.1', '::1'])

const fallbackInfo: ShotAISystemInfo = {
  version: '1.0.0',
  platform: 'unknown',
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
