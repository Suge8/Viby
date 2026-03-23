import chalk from 'chalk'
import { startRunner } from '@/runner/run'
import {
    listRunnerSessions,
    stopRunner,
    stopRunnerSession
} from '@/runner/controlClient'
import { getLatestRunnerLog } from '@/ui/logger'
import { runDoctorCommand } from '@/ui/doctor'
import { initializeToken } from '@/ui/tokenInit'
import type { CommandDefinition } from './types'

export const runnerCommand: CommandDefinition = {
    name: 'runner',
    requiresRuntimeAssets: true,
    run: async ({ commandArgs }) => {
        const runnerSubcommand = commandArgs[0]

        if (runnerSubcommand === 'list') {
            try {
                const sessions = await listRunnerSessions()

                if (sessions.length === 0) {
                    console.log('No active sessions this runner is aware of (they might have been started by a previous version of the runner)')
                } else {
                    console.log('Active sessions:')
                    console.log(JSON.stringify(sessions, null, 2))
                }
            } catch {
                console.log('No runner running')
            }
            return
        }

        if (runnerSubcommand === 'stop-session') {
            const sessionId = commandArgs[1]
            if (!sessionId) {
                console.error('Session ID required')
                process.exit(1)
            }

            try {
                const success = await stopRunnerSession(sessionId)
                console.log(success ? 'Session stopped' : 'Failed to stop session')
            } catch {
                console.log('No runner running')
            }
            return
        }

        if (runnerSubcommand === 'start') {
            console.error('Runner startup is managed by `viby hub`. Start the hub instead.')
            process.exit(1)
        }

        if (runnerSubcommand === 'start-sync') {
            await initializeToken()
            await startRunner()
            process.exit(0)
        }

        if (runnerSubcommand === 'stop') {
            await stopRunner()
            process.exit(0)
        }

        if (runnerSubcommand === 'status') {
            await runDoctorCommand('runner')
            process.exit(0)
        }

        if (runnerSubcommand === 'logs') {
            const latest = await getLatestRunnerLog()
            if (!latest) {
                console.log('No runner logs found')
            } else {
                console.log(latest.path)
            }
            process.exit(0)
        }

        console.log(`
${chalk.bold('viby runner')} - Runner diagnostics

${chalk.bold('Usage:')}
  viby runner stop               Stop the runner and end hub-managed sessions
  viby runner status             Show runner status
  viby runner list               List active sessions
  viby runner logs               Show latest runner log path

  If you want to kill all viby related processes run 
  ${chalk.cyan('viby doctor clean')}

${chalk.bold('Note:')} Runner startup is owned by ${chalk.cyan('viby hub')}.
  ${chalk.gray('`viby runner start-sync` remains an internal entry used by the hub.')}

${chalk.bold('To clean up runaway processes:')} Use ${chalk.cyan('viby doctor clean')}
`)
    }
}
