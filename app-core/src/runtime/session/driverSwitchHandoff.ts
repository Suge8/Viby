import type { Stats } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'

import { parseSessionHandoffSnapshot, SAME_SESSION_SWITCH_TARGET_DRIVERS } from '@viby/protocol'
import type { SameSessionSwitchTargetDriver, SessionDriver, SessionHandoffSnapshot } from '@viby/protocol/types'

const DRIVER_SWITCH_HANDOFF_DIR_PREFIX = 'viby-driver-switch-'
const DRIVER_SWITCH_HANDOFF_FILE_NAME = 'handoff.json'

export const MAX_DRIVER_SWITCH_HANDOFF_BYTES = 2 * 1024 * 1024
export const DRIVER_SWITCH_HANDOFF_IO_TIMEOUT_MS = 5_000

export type DriverSwitchTarget = SameSessionSwitchTargetDriver

export type DriverSwitchHandoffTransport = {
    targetDriver: DriverSwitchTarget
    handoffFilePath: string
    cleanup: () => Promise<void>
}

export function parseDriverSwitchTarget(targetDriver: SessionDriver | string): DriverSwitchTarget {
    if (SAME_SESSION_SWITCH_TARGET_DRIVERS.includes(targetDriver as DriverSwitchTarget)) {
        return targetDriver as DriverSwitchTarget
    }

    throw new Error(`Unsupported driver switch target: ${targetDriver}`)
}

export async function writeDriverSwitchHandoffTransport(options: {
    targetDriver: SessionDriver
    handoffSnapshot: SessionHandoffSnapshot
}): Promise<DriverSwitchHandoffTransport> {
    const targetDriver = parseDriverSwitchTarget(options.targetDriver)
    const payload = JSON.stringify(options.handoffSnapshot)
    if (!payload) {
        throw new Error('Driver switch handoff payload is empty')
    }

    const payloadBytes = Buffer.byteLength(payload)
    if (payloadBytes > MAX_DRIVER_SWITCH_HANDOFF_BYTES) {
        throw new Error(`Driver switch handoff payload exceeds ${MAX_DRIVER_SWITCH_HANDOFF_BYTES} bytes`)
    }

    const handoffDirectory = await fs.mkdtemp(join(os.tmpdir(), DRIVER_SWITCH_HANDOFF_DIR_PREFIX))
    const handoffFilePath = join(handoffDirectory, DRIVER_SWITCH_HANDOFF_FILE_NAME)

    try {
        await fs.writeFile(handoffFilePath, payload, {
            encoding: 'utf8',
            signal: AbortSignal.timeout(DRIVER_SWITCH_HANDOFF_IO_TIMEOUT_MS),
        })
    } catch (error) {
        await cleanupDriverSwitchHandoffDirectory(handoffDirectory)
        throw new Error(`Failed to write driver switch handoff file: ${formatDriverSwitchHandoffError(error)}`)
    }

    return {
        targetDriver,
        handoffFilePath,
        cleanup: async () => {
            await cleanupDriverSwitchHandoffDirectory(handoffDirectory)
        },
    }
}

export async function loadDriverSwitchHandoff(options: {
    targetDriver: SessionDriver | string
    handoffFilePath: string
    expectedAgent?: string
}): Promise<{
    targetDriver: DriverSwitchTarget
    handoffSnapshot: SessionHandoffSnapshot
}> {
    const targetDriver = parseDriverSwitchTarget(options.targetDriver)
    const handoffFilePath = options.handoffFilePath.trim()
    if (!handoffFilePath) {
        throw new Error('Missing --driver-switch-handoff-file value')
    }
    if (options.expectedAgent && options.expectedAgent !== targetDriver) {
        throw new Error(`Driver switch target ${targetDriver} does not match agent ${options.expectedAgent}`)
    }

    const stats = await readDriverSwitchHandoffStats(handoffFilePath)
    if (!stats.isFile()) {
        throw new Error(`Driver switch handoff path is not a file: ${handoffFilePath}`)
    }
    if (stats.size > MAX_DRIVER_SWITCH_HANDOFF_BYTES) {
        throw new Error(`Driver switch handoff payload exceeds ${MAX_DRIVER_SWITCH_HANDOFF_BYTES} bytes`)
    }

    const rawPayload = await readDriverSwitchHandoffFile(handoffFilePath)

    let parsedPayload: unknown
    try {
        parsedPayload = JSON.parse(rawPayload) as unknown
    } catch {
        throw new Error(`Invalid driver switch handoff JSON: ${handoffFilePath}`)
    }

    return {
        targetDriver,
        handoffSnapshot: parseSessionHandoffSnapshot(parsedPayload),
    }
}

async function cleanupDriverSwitchHandoffDirectory(handoffDirectory: string): Promise<void> {
    await fs.rm(handoffDirectory, {
        recursive: true,
        force: true,
        maxRetries: 0,
    })
}

async function readDriverSwitchHandoffStats(handoffFilePath: string): Promise<Stats> {
    try {
        return await fs.stat(handoffFilePath)
    } catch (error) {
        throw new Error(
            `Driver switch handoff file not found: ${handoffFilePath} (${formatDriverSwitchHandoffError(error)})`
        )
    }
}

async function readDriverSwitchHandoffFile(handoffFilePath: string): Promise<string> {
    try {
        return await fs.readFile(handoffFilePath, {
            encoding: 'utf8',
            signal: AbortSignal.timeout(DRIVER_SWITCH_HANDOFF_IO_TIMEOUT_MS),
        })
    } catch (error) {
        throw new Error(`Failed to read driver switch handoff file: ${formatDriverSwitchHandoffError(error)}`)
    }
}

function formatDriverSwitchHandoffError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}
