import { describe, expect, it } from 'vitest'
import { withCurrentLaunchOption } from './usePiLaunchOptions'

describe('withCurrentLaunchOption', () => {
    it('keeps the current saved model visible when the curated list no longer includes it', () => {
        const options = withCurrentLaunchOption(
            [
                { value: 'auto', label: 'Terminal default model' },
                { value: 'gpt-5.4', label: 'GPT-5.4' },
            ],
            'gpt-5.99-preview',
            'auto'
        )

        expect(options).toEqual([
            { value: 'auto', label: 'Terminal default model' },
            { value: 'gpt-5.99-preview', label: 'gpt-5.99-preview' },
            { value: 'gpt-5.4', label: 'GPT-5.4' },
        ])
    })

    it('does not inject a duplicate option when the current value is already known', () => {
        const options = withCurrentLaunchOption(
            [
                { value: 'default', label: 'Terminal default reasoning effort' },
                { value: 'high', label: 'High' },
            ],
            'high',
            'default'
        )

        expect(options).toEqual([
            { value: 'default', label: 'Terminal default reasoning effort' },
            { value: 'high', label: 'High' },
        ])
    })

    it('does not inject the default sentinel value', () => {
        const options = withCurrentLaunchOption([{ value: 'auto', label: 'Terminal default model' }], 'auto', 'auto')

        expect(options).toEqual([{ value: 'auto', label: 'Terminal default model' }])
    })
})
