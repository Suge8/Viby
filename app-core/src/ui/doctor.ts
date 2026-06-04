import { configuration } from '@/configuration'
import { getInvokedCwd } from '@/utils/invokedCwd'

export function getEnvironmentInfo(): Record<string, unknown> {
    return {
        PWD: process.env.PWD,
        VIBY_HOME: process.env.VIBY_HOME,
        VIBY_API_URL: process.env.VIBY_API_URL,
        VIBY_PROJECT_ROOT: process.env.VIBY_PROJECT_ROOT,
        HUB_OWNER_TOKEN_SET: Boolean(process.env.VIBY_HUB_OWNER_TOKEN),
        DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING: process.env.DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING,
        NODE_ENV: process.env.NODE_ENV,
        DEBUG: process.env.DEBUG,
        workingDirectory: getInvokedCwd(),
        processArgv: process.argv,
        vibyDir: configuration?.vibyHomeDir,
        apiUrl: configuration?.apiUrl,
        logsDir: configuration?.logsDir,
        processPid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        user: process.env.USER,
        home: process.env.HOME,
        shell: process.env.SHELL,
        terminal: process.env.TERM,
    }
}
