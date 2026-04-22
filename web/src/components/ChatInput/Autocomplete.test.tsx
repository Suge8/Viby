import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Autocomplete } from '@/components/ChatInput/Autocomplete'

const translationHarness = vi.hoisted(() => ({
    values: {
        'autocomplete.group.native': 'Commands',
        'autocomplete.group.actions': 'Actions',
        'autocomplete.commandHint.prefix': 'About: ',
        'autocomplete.commandHint.status': 'Show current status',
        'autocomplete.commandHint.help': 'Show available commands',
        'autocomplete.commandHint.compact': 'Trim the current context',
        'autocomplete.sessionAction.new': 'Open New Session',
    } as Record<string, string>,
}))

vi.mock('@/components/ui/button', () => ({
    Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
        <button {...props}>{props.children}</button>
    ),
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => translationHarness.values[key] ?? key,
    }),
}))

afterEach(() => {
    cleanup()
})

describe('Autocomplete', () => {
    it('renders a single-language heading and hint set when the locale is Chinese', () => {
        translationHarness.values = {
            'autocomplete.group.native': '命令',
            'autocomplete.commandHint.review': '检查当前改动',
        }

        render(
            <Autocomplete
                suggestions={[
                    {
                        key: 'cmd-zh',
                        text: '/review',
                        label: '/review',
                        description: '检查当前改动',
                        groupLabel: 'Native Commands',
                    },
                ]}
                selectedIndex={0}
                onSelect={vi.fn()}
            />
        )

        expect(screen.getByText('命令')).toBeInTheDocument()
        expect(screen.getByText('检查当前改动')).toBeInTheDocument()
        expect(screen.queryByText('Commands')).not.toBeInTheDocument()
    })

    it('renders every command as a single inline row with productized hints', () => {
        translationHarness.values = {
            'autocomplete.group.native': 'Commands',
            'autocomplete.group.actions': 'Actions',
            'autocomplete.commandHint.status': 'Show current status',
            'autocomplete.commandHint.help': 'Show available commands',
            'autocomplete.commandHint.compact': 'Trim the current context',
            'autocomplete.commandHint.review': 'Review current changes and find issues',
            'autocomplete.commandHint.fork': 'Create a branched copy of this chat',
            'autocomplete.commandHint.rewind': 'Jump back to an earlier step',
            'autocomplete.sessionAction.new': 'Open New Session',
        }

        render(
            <Autocomplete
                suggestions={[
                    {
                        key: 'cmd-1',
                        text: '/review',
                        label: '/review',
                        description: 'Review current changes and find issues',
                        groupLabel: 'Native Commands',
                    },
                    {
                        key: 'cmd-2',
                        text: '/status',
                        label: '/status',
                        description: 'Show the current runtime state',
                        groupLabel: 'Native Commands',
                    },
                    {
                        key: 'cmd-3',
                        text: '/help',
                        label: '/help',
                        description: 'Show available commands',
                        groupLabel: 'Native Commands',
                    },
                    {
                        key: 'cmd-4',
                        text: '/compact',
                        label: '/compact',
                        description: 'Compact the current context window',
                        groupLabel: 'Native Commands',
                    },
                    {
                        key: 'cmd-5',
                        text: '/fork',
                        label: '/fork',
                        description: 'Create a fork',
                        groupLabel: 'Session Actions',
                    },
                    {
                        key: 'cmd-6',
                        text: '/rewind',
                        label: '/rewind',
                        description: 'Rewind the conversation',
                        groupLabel: 'Session Actions',
                    },
                ]}
                selectedIndex={0}
                onSelect={vi.fn()}
            />
        )

        expect(screen.getByText('Commands')).toBeInTheDocument()
        expect(screen.getByText('/review')).toBeInTheDocument()
        expect(screen.getByText('Review current changes and find issues')).toBeInTheDocument()
        expect(screen.getByText('Show current status')).toBeInTheDocument()
        expect(screen.getByText('Show available commands')).toBeInTheDocument()
        expect(screen.getByText('Trim the current context')).toBeInTheDocument()
        expect(screen.getByText('Create a branched copy of this chat')).toBeInTheDocument()
        expect(screen.getByText('Jump back to an earlier step')).toBeInTheDocument()
    })

    it('translates lifecycle new-session actions without extra effect badges', () => {
        translationHarness.values = {
            'autocomplete.group.actions': 'Actions',
            'autocomplete.sessionAction.new': 'Open New Session',
        }

        render(
            <Autocomplete
                suggestions={[
                    {
                        key: 'cmd-2',
                        text: '/new',
                        label: '/new',
                        actionType: 'open_new_session',
                        groupLabel: 'Session Actions',
                    },
                ]}
                selectedIndex={0}
                onSelect={vi.fn()}
            />
        )

        expect(screen.getByText('Actions')).toBeInTheDocument()
        expect(screen.getByText('Open New Session')).toBeInTheDocument()
    })
})
