export {}

declare global {
  interface Window {
    electronAPI?: {
      getVersion?: () => Promise<string>
      getSecret?: (key: 'openai' | 'anthropic') => Promise<string | null>
      setSecret?: (key: 'openai' | 'anthropic', value: string) => Promise<boolean>
      selectFolder?: () => Promise<string | null>
      openExternalUrl?: (url: string) => Promise<boolean>
      startImageDrag?: (payload: { url: string; name: string }) => void
    }
  }
}
