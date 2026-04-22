import { useEffect, useRef, useState } from 'react'
import type { ApiClient } from '@/api/client'
import { formatUserFacingErrorMessage } from '@/lib/userFacingError'
import type { AgentLaunchConfig } from '@/types/api'

type TranslationFn = (key: string, params?: Record<string, string | number>) => string

type PiAgentLaunchConfig = AgentLaunchConfig & { agent: 'pi' }

type UsePiLaunchConfigOptions = {
    api: ApiClient
    agent: string
    directory: string
    t: TranslationFn
}

type PiLaunchConfigState = {
    config: PiAgentLaunchConfig | null
    error: string | null
}

const UNSUPPORTED_PI_CONFIG_RESPONSE_MESSAGE = 'Unsupported Pi launch config response'

function toPiLaunchConfig(config: AgentLaunchConfig): PiAgentLaunchConfig {
    return {
        ...config,
        agent: 'pi',
    }
}

export function usePiLaunchConfig(options: UsePiLaunchConfigOptions): PiLaunchConfigState {
    const [state, setState] = useState<PiLaunchConfigState>({ config: null, error: null })
    const cacheRef = useRef(new Map<string, PiAgentLaunchConfig>())

    useEffect(() => {
        if (options.agent !== 'pi' || !options.directory) {
            setState({ config: null, error: null })
            return
        }

        const cacheKey = options.directory
        const cachedConfig = cacheRef.current.get(cacheKey)
        if (cachedConfig) {
            setState({ config: cachedConfig, error: null })
            return
        }

        let cancelled = false
        setState({ config: null, error: null })

        void options.api
            .resolveAgentLaunchConfig({
                agent: 'pi',
                directory: options.directory,
            })
            .then((response) => {
                if (cancelled) {
                    return
                }

                if (response.type === 'error') {
                    setState({ config: null, error: response.message })
                    return
                }

                if (response.config.agent !== 'pi') {
                    setState({ config: null, error: UNSUPPORTED_PI_CONFIG_RESPONSE_MESSAGE })
                    return
                }

                const nextConfig = toPiLaunchConfig(response.config)
                cacheRef.current.set(cacheKey, nextConfig)
                setState({ config: nextConfig, error: null })
            })
            .catch((error) => {
                if (cancelled) {
                    return
                }

                setState({
                    config: null,
                    error: formatUserFacingErrorMessage(error, {
                        t: options.t,
                        fallbackKey: 'error.session.create',
                    }),
                })
            })

        return () => {
            cancelled = true
        }
    }, [options.agent, options.api, options.directory, options.t])

    return state
}
