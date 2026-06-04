import type { DefaultEventsMap, Server, Socket } from 'socket.io'

export type SocketData = {
    userId?: number
    deviceId?: string
    webSubscription?: {
        all: boolean
        sessionId: string | null
        machineId: string | null
        pushEndpoint: string | null
    }
}

export type SocketServer = Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>
export type SocketWithData = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>
