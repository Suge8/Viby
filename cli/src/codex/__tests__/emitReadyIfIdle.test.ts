import { describe, expect, it, vi } from 'vitest';
import { emitReadyIfIdle } from '../runCodex';

describe('emitReadyIfIdle', () => {
    it('emits ready only after the turn is idle', async () => {
        const sendReady = vi.fn();
        const notify = vi.fn();

        const emitted = await emitReadyIfIdle({
            queueSize: () => 0,
            shouldExit: () => false,
            sendReady,
            notify,
        });

        expect(emitted).toBe(true);
        expect(sendReady).toHaveBeenCalledTimes(1);
        expect(notify).toHaveBeenCalledTimes(1);
    });

    it('skips when a message is still pending', async () => {
        const sendReady = vi.fn();

        const emitted = await emitReadyIfIdle({
            hasPending: () => true,
            queueSize: () => 0,
            shouldExit: () => false,
            sendReady,
        });

        expect(emitted).toBe(false);
        expect(sendReady).not.toHaveBeenCalled();
    });

    it('skips when queue still has items', async () => {
        const sendReady = vi.fn();

        const emitted = await emitReadyIfIdle({
            queueSize: () => 2,
            shouldExit: () => false,
            sendReady,
        });

        expect(emitted).toBe(false);
        expect(sendReady).not.toHaveBeenCalled();
    });

    it('skips when shutdown is requested', async () => {
        const sendReady = vi.fn();

        const emitted = await emitReadyIfIdle({
            queueSize: () => 0,
            shouldExit: () => true,
            sendReady,
        });

        expect(emitted).toBe(false);
        expect(sendReady).not.toHaveBeenCalled();
    });

    it('rechecks turn idleness after the pre-ready state flush completes', async () => {
        const sendReady = vi.fn();
        let hasPending = false;

        const emitted = await emitReadyIfIdle({
            hasPending: () => hasPending,
            queueSize: () => 0,
            shouldExit: () => false,
            flushBeforeReady: async () => {
                hasPending = true;
            },
            sendReady,
        });

        expect(emitted).toBe(false);
        expect(sendReady).not.toHaveBeenCalled();
    });
});
