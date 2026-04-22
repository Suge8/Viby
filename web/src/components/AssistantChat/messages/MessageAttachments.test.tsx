import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MessageAttachments } from './MessageAttachments'

describe('MessageAttachments', () => {
    it('renders image attachments inside a stable square shell', () => {
        const { container } = render(
            <MessageAttachments
                attachments={[
                    {
                        id: 'attachment-image-1',
                        filename: 'drawing.png',
                        size: 2048,
                        path: '/tmp/drawing.png',
                        mimeType: 'image/png',
                        previewUrl: '/preview/drawing.png',
                    },
                ]}
            />
        )

        const image = screen.getByRole('img', { name: 'drawing.png' })
        expect(image).toHaveAttribute('loading', 'lazy')
        expect(image).toHaveAttribute('decoding', 'async')
        expect(image).toHaveClass('h-full', 'w-full', 'object-contain')
        expect(image.parentElement).toHaveClass('w-48', 'aspect-square', 'bg-[var(--app-subtle-bg)]')
        expect(container.querySelector('.flex.flex-wrap')).not.toBeNull()
    })
})
