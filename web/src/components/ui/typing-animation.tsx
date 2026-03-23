"use client"

import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

type TypingAnimationProps = {
    text: string
    className?: string
    speed?: number
    showCursor?: boolean
}

export function TypingAnimation(props: TypingAnimationProps): ReactNode {
    const { text, className, speed = 28, showCursor = false } = props
    const [displayedText, setDisplayedText] = useState('')

    useEffect(() => {
        setDisplayedText('')

        if (!text) {
            return
        }

        let index = 0
        const timer = window.setInterval(() => {
            index += 1
            setDisplayedText(text.slice(0, index))
            if (index >= text.length) {
                window.clearInterval(timer)
            }
        }, speed)

        return () => {
            window.clearInterval(timer)
        }
    }, [speed, text])

    return (
        <motion.span
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn('inline-flex items-center gap-1', className)}
        >
            <span>{displayedText}</span>
            {showCursor ? <span className="animate-pulse">|</span> : null}
        </motion.span>
    )
}
