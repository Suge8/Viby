import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { configuration } from '@/configuration'

const {
    readSettingsMock,
    readRunnerStateMock,
    clearRunnerStateMock
} = vi.hoisted(() => ({
    readSettingsMock: vi.fn(),
    readRunnerStateMock: vi.fn(),
    clearRunnerStateMock: vi.fn()
}))

vi.mock('@/persistence', () => ({
    readSettings: readSettingsMock,
    readRunnerState: readRunnerStateMock,
    clearRunnerState: clearRunnerStateMock
}))

import { resolveCurrentRunnerIdentity } from './controlClient'

const ORIGINAL_API_URL = process.env.VIBY_API_URL
const ORIGINAL_CLI_API_TOKEN = process.env.CLI_API_TOKEN

describe('resolveCurrentRunnerIdentity', () => {
    beforeEach(() => {
        readSettingsMock.mockReset()
        readRunnerStateMock.mockReset()
        clearRunnerStateMock.mockReset()

        delete process.env.VIBY_API_URL
        delete process.env.CLI_API_TOKEN

        configuration._setApiUrl('http://localhost:37173')
        configuration._setCliApiToken('config-token')
    })

    afterAll(() => {
        if (ORIGINAL_API_URL === undefined) {
            delete process.env.VIBY_API_URL
        } else {
            process.env.VIBY_API_URL = ORIGINAL_API_URL
        }

        if (ORIGINAL_CLI_API_TOKEN === undefined) {
            delete process.env.CLI_API_TOKEN
        } else {
            process.env.CLI_API_TOKEN = ORIGINAL_CLI_API_TOKEN
        }
    })

    it('falls back to settings when env vars are absent', async () => {
        readSettingsMock.mockResolvedValue({
            apiUrl: 'https://settings.viby.dev',
            cliApiToken: 'settings-token',
            machineId: 'machine-from-settings'
        })

        await expect(resolveCurrentRunnerIdentity()).resolves.toEqual({
            apiUrl: 'https://settings.viby.dev',
            cliApiToken: 'settings-token',
            machineId: 'machine-from-settings'
        })
    })

    it('lets env vars override settings values', async () => {
        process.env.VIBY_API_URL = 'https://env.viby.dev'
        process.env.CLI_API_TOKEN = 'env-token'
        readSettingsMock.mockResolvedValue({
            apiUrl: 'https://settings.viby.dev',
            cliApiToken: 'settings-token',
            machineId: 'machine-from-settings'
        })

        await expect(resolveCurrentRunnerIdentity()).resolves.toEqual({
            apiUrl: 'https://env.viby.dev',
            cliApiToken: 'env-token',
            machineId: 'machine-from-settings'
        })
    })

    it('falls back to configuration defaults when settings are empty', async () => {
        readSettingsMock.mockResolvedValue({})
        configuration._setApiUrl('https://config.viby.dev')
        configuration._setCliApiToken('config-token')

        await expect(resolveCurrentRunnerIdentity()).resolves.toEqual({
            apiUrl: 'https://config.viby.dev',
            cliApiToken: 'config-token',
            machineId: undefined
        })
    })
})
