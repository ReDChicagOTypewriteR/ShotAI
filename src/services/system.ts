export interface ShotAISystemInfo {
  version: string
  isHost: boolean
  canManage: boolean
  port: number
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
