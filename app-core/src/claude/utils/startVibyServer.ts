import type { RuntimeSessionClient } from '@/api/runtimeSessionClient'

export async function startVibyServer(client: RuntimeSessionClient): Promise<{
    url: string
    toolNames: string[]
    stop: () => void
} | null> {
    void client
    return null
}
