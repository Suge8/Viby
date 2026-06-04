export type RemotePairingEventSeq = {
    accept(seq: number, force?: boolean): boolean
    lastSeen(): number
}

export function createRemotePairingEventSeq(): RemotePairingEventSeq {
    let lastSeenSeq = 0
    return {
        accept(seq, force) {
            const accepted = force || seq > lastSeenSeq
            if (accepted) lastSeenSeq = Math.max(lastSeenSeq, seq)
            return accepted
        },
        lastSeen: () => lastSeenSeq,
    }
}
