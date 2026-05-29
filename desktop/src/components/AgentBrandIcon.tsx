import type { AgentFlavor } from '@viby/protocol'
import type { CSSProperties, JSX } from 'react'
import { AGENT_ICONS } from '@/lib/agentPresentation'

type AgentBrandIconProps = {
    driver: AgentFlavor
    size?: number
    className?: string
}

// Tunes per-brand visual weight so every logo reads at the same size inside the
// shared rounded frame. Without this, raster favicons dwarf SVG marks.
const BRAND_SCALE: Partial<Record<AgentFlavor, number>> = {
    codex: 1.6,
    opencode: 0.8,
    pi: 1.3,
}

// Pi ships a single-color SVG that only reads correctly as a mask; the rest are
// full-color marks rendered as <img>. Brand frames stay white-on-black across
// themes so the icon behaves like a favicon — stable identity in any surface.
const MASK_DRIVERS: ReadonlySet<AgentFlavor> = new Set(['pi'])

export function AgentBrandIcon(props: AgentBrandIconProps): JSX.Element {
    const size = props.size ?? 22
    const className = `desktop-agent-brand ${props.className ?? ''}`.trim()
    const frameStyle: CSSProperties = {
        width: size,
        height: size,
        borderRadius: Math.max(6, Math.round(size * 0.28)),
    }
    const scale = BRAND_SCALE[props.driver]
    const markStyle: CSSProperties | undefined = scale
        ? { transform: `scale(${scale})`, transformOrigin: 'center' }
        : undefined

    if (MASK_DRIVERS.has(props.driver)) {
        return (
            <span className={className} style={frameStyle} aria-hidden="true">
                <span
                    className="desktop-agent-brand-mask"
                    style={{
                        WebkitMaskImage: `url(${AGENT_ICONS[props.driver]})`,
                        maskImage: `url(${AGENT_ICONS[props.driver]})`,
                        ...markStyle,
                    }}
                />
            </span>
        )
    }

    return (
        <span className={className} style={frameStyle} aria-hidden="true">
            <img
                className="desktop-agent-brand-mark"
                src={AGENT_ICONS[props.driver]}
                alt=""
                draggable={false}
                style={markStyle}
            />
        </span>
    )
}
