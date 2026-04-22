import { ApiSessionClient } from '@/api/apiSession'

export async function startVibyServer(client: ApiSessionClient): Promise<{
    url: string
    toolNames: string[]
    stop: () => void
} | null> {
    void client
    return null
}
