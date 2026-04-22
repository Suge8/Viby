import { BrandMarkIcon } from '@/components/icons'
import { type AppIconProps, withDefaultClassName } from '@/components/iconUtils'
import { getSessionAgentBrand, type SessionAgentBrand } from '@/lib/sessionAgentLabel'

type SessionAgentIconProps = Omit<AppIconProps, 'className'> & {
    className: string
}

const OFFICIAL_AGENT_ASSETS = {
    claude: '/agent-claude-favicon.png',
    codex: '/agent-codex-v8.png',
    copilot: '/agent-copilot.svg',
    gemini: '/agent-gemini.svg',
    opencode: '/agent-opencode.png',
    pi: '/agent-pi.svg',
} as const

const MASK_ICON_STYLE = {
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
} as const

const BRAND_ICON_SCALE: Partial<Record<SessionAgentBrand, number>> = {
    codex: 1.6,
    opencode: 0.8,
    pi: 1.3,
}

export function SessionAgentBrandIcon(
    props: AppIconProps & {
        driver?: string | null
    }
): React.JSX.Element {
    const { driver, className, style, ...restProps } = props
    const resolvedClassName = withDefaultClassName(className)
    const brand = getSessionAgentBrand(driver)
    const resolvedStyle = getBrandIconStyle(brand, style)

    switch (brand) {
        case 'claude':
            return (
                <BrandImageIcon
                    {...restProps}
                    className={resolvedClassName}
                    style={resolvedStyle}
                    src={OFFICIAL_AGENT_ASSETS.claude}
                />
            )
        case 'codex':
            return (
                <BrandImageIcon
                    {...restProps}
                    className={resolvedClassName}
                    style={resolvedStyle}
                    src={OFFICIAL_AGENT_ASSETS.codex}
                />
            )
        case 'copilot':
            return (
                <BrandMaskIcon
                    {...restProps}
                    className={resolvedClassName}
                    style={resolvedStyle}
                    src={OFFICIAL_AGENT_ASSETS.copilot}
                />
            )
        case 'cursor':
            return <CursorMarkIcon {...restProps} className={resolvedClassName} style={resolvedStyle} />
        case 'gemini':
            return (
                <BrandImageIcon
                    {...restProps}
                    className={resolvedClassName}
                    style={resolvedStyle}
                    src={OFFICIAL_AGENT_ASSETS.gemini}
                />
            )
        case 'opencode':
            return (
                <BrandImageIcon
                    {...restProps}
                    className={resolvedClassName}
                    style={resolvedStyle}
                    src={OFFICIAL_AGENT_ASSETS.opencode}
                />
            )
        case 'pi':
            return (
                <BrandMaskIcon
                    {...restProps}
                    className={resolvedClassName}
                    color="#111111"
                    style={resolvedStyle}
                    src={OFFICIAL_AGENT_ASSETS.pi}
                />
            )
        default:
            return <BrandMarkIcon {...restProps} className={resolvedClassName} style={resolvedStyle} />
    }
}

function getBrandIconStyle(
    brand: SessionAgentBrand,
    style: React.CSSProperties | undefined
): React.CSSProperties | undefined {
    const scale = BRAND_ICON_SCALE[brand]
    if (!scale) {
        return style
    }

    return {
        transform: `scale(${scale})`,
        transformOrigin: 'center',
        ...style,
    }
}

function BrandImageIcon(
    props: SessionAgentIconProps & {
        src: string
    }
): React.JSX.Element {
    const { src, className, style } = props

    return (
        <img
            src={src}
            alt=""
            aria-hidden="true"
            className={`${className} block shrink-0 object-contain object-center`}
            style={style}
            draggable={false}
        />
    )
}

function BrandMaskIcon(
    props: SessionAgentIconProps & {
        src: string
    }
): React.JSX.Element {
    const { src, className, color, style } = props

    return (
        <span
            aria-hidden="true"
            className={`${className} inline-block shrink-0`}
            style={{
                backgroundColor: color ?? 'currentColor',
                WebkitMaskImage: `url(${src})`,
                maskImage: `url(${src})`,
                ...MASK_ICON_STYLE,
                ...style,
            }}
        />
    )
}

function CursorMarkIcon(props: SessionAgentIconProps): React.JSX.Element {
    return (
        <svg {...props} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23" />
        </svg>
    )
}
