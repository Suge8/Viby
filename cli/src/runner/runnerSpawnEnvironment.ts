import fs from 'fs/promises'
import os from 'os'
import { join } from 'path'
import { configuration } from '@/configuration'
import type { SpawnSessionOptions } from '@/modules/common/rpcTypes'
import { type DriverSwitchHandoffTransport, writeDriverSwitchHandoffTransport } from './driverSwitchHandoff'
import type { WorktreeInfo } from './worktree'

export async function buildSpawnEnvironment(
    options: SpawnSessionOptions,
    worktreeInfo: WorktreeInfo | null
): Promise<Record<string, string>> {
    let env: Record<string, string> = {
        VIBY_API_URL: configuration.apiUrl,
        CLI_API_TOKEN: configuration.cliApiToken,
    }

    if (options.machineId) {
        env.VIBY_MACHINE_ID = options.machineId
    }

    if (options.token) {
        if (options.agent === 'codex') {
            const codexHomeDir = await fs.mkdtemp(join(os.tmpdir(), 'viby-codex-'))
            await fs.writeFile(join(codexHomeDir, 'auth.json'), options.token)
            env = {
                ...env,
                CODEX_HOME: codexHomeDir,
            }
        } else if (options.agent === 'claude' || !options.agent) {
            env = {
                ...env,
                CLAUDE_CODE_OAUTH_TOKEN: options.token,
            }
        }
    }

    if (!worktreeInfo) {
        return env
    }

    return {
        ...env,
        VIBY_WORKTREE_BASE_PATH: worktreeInfo.basePath,
        VIBY_WORKTREE_BRANCH: worktreeInfo.branch,
        VIBY_WORKTREE_NAME: worktreeInfo.name,
        VIBY_WORKTREE_PATH: worktreeInfo.worktreePath,
        VIBY_WORKTREE_CREATED_AT: String(worktreeInfo.createdAt),
    }
}

export async function createDriverSwitchTransport(
    options: SpawnSessionOptions
): Promise<DriverSwitchHandoffTransport | null> {
    if (!options.driverSwitch) {
        return null
    }

    return await writeDriverSwitchHandoffTransport(options.driverSwitch)
}
