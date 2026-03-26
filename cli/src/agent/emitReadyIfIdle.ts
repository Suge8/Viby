export type ReadyEventOptions = {
    hasPending?: () => boolean;
    queueSize: () => number;
    shouldExit: () => boolean;
    flushBeforeReady?: () => Promise<void>;
    sendReady: () => void;
    notify?: () => void;
};

type ReadyStateClient = {
    flushAgentStateUpdates?: (options?: { timeoutMs?: number }) => Promise<void>;
};

function shouldEmitReady(options: ReadyEventOptions): boolean {
    if (options.shouldExit()) {
        return false;
    }
    if (options.hasPending?.()) {
        return false;
    }
    if (options.queueSize() > 0) {
        return false;
    }

    return true;
}

export async function emitReadyIfIdle(options: ReadyEventOptions): Promise<boolean> {
    if (!shouldEmitReady(options)) {
        return false;
    }

    await options.flushBeforeReady?.();

    if (!shouldEmitReady(options)) {
        return false;
    }

    options.sendReady();
    options.notify?.();
    return true;
}

export async function flushReadyStateBeforeReady(client: ReadyStateClient): Promise<void> {
    await client.flushAgentStateUpdates?.();
}
