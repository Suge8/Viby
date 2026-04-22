import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PermissionFooter } from '@/components/ToolCard/PermissionFooter'

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) =>
            (
                ({
                    'tool.awaitingInputInPanel': 'Respond in the active panel…',
                    'tool.canceled': 'Canceled',
                    'tool.deny': 'Deny',
                }) as Record<string, string>
            )[key] ?? key,
    }),
}))

describe('PermissionFooter', () => {
    it('reduces pending permissions to a non-interactive status mirror', () => {
        render(
            <PermissionFooter
                tool={{
                    id: 'tool-1',
                    name: 'request_user_input',
                    state: 'pending',
                    input: null,
                    createdAt: 1,
                    startedAt: null,
                    completedAt: null,
                    description: null,
                    permission: {
                        id: 'request-1',
                        status: 'pending',
                    },
                }}
            />
        )

        expect(screen.getByText('Respond in the active panel…')).toBeInTheDocument()
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
})
