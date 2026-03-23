import { BrandIcon } from '@/components/icons'
import { withDefaultClassName, type AppIconProps } from '@/components/iconUtils'

type SessionAgentBrand = 'codex' | 'claude' | 'gemini' | 'cursor' | 'opencode' | 'unknown'
type SessionAgentIconProps = Omit<AppIconProps, 'className'> & {
    className: string
}

const SESSION_AGENT_BRANDS: Record<string, SessionAgentBrand> = {
    claude: 'claude',
    codex: 'codex',
    cursor: 'cursor',
    gemini: 'gemini',
    opencode: 'opencode'
}

const SESSION_AGENT_LABELS: Record<SessionAgentBrand, string> = {
    codex: 'Codex',
    claude: 'Claude',
    gemini: 'Gemini',
    cursor: 'Cursor',
    opencode: 'OpenCode',
    unknown: 'Unknown'
}

export function getSessionAgentLabel(flavor?: string | null): string {
    return SESSION_AGENT_LABELS[getSessionAgentBrand(flavor)]
}

export function SessionAgentBrandIcon(props: AppIconProps & {
    flavor?: string | null
}): React.JSX.Element {
    const { flavor, className, ...restProps } = props
    const resolvedClassName = withDefaultClassName(className)
    const brand = getSessionAgentBrand(flavor)

    switch (brand) {
        case 'codex':
            return <OpenAIBlossomIcon {...restProps} className={resolvedClassName} />
        case 'claude':
            return <ClaudeMarkIcon {...restProps} className={resolvedClassName} />
        case 'gemini':
            return <GeminiSparkIcon {...restProps} className={resolvedClassName} />
        case 'cursor':
            return <CursorMarkIcon {...restProps} className={resolvedClassName} />
        case 'opencode':
            return <OpenCodeMarkIcon {...restProps} className={resolvedClassName} />
        default:
            return <BrandIcon {...restProps} className={resolvedClassName} />
    }
}

function getSessionAgentBrand(flavor?: string | null): SessionAgentBrand {
    const normalizedFlavor = flavor?.trim().toLowerCase()
    if (!normalizedFlavor) {
        return 'unknown'
    }

    return SESSION_AGENT_BRANDS[normalizedFlavor] ?? 'unknown'
}

function OpenAIBlossomIcon(props: SessionAgentIconProps): React.JSX.Element {
    return (
        <svg {...props} viewBox="146 227 268 265" fill="none" aria-hidden="true">
            <path
                d="M249.176 323.434V298.276C249.176 296.158 249.971 294.569 251.825 293.509L302.406 264.381C309.29 260.409 317.5 258.555 325.973 258.555C357.75 258.555 377.877 283.185 377.877 309.399C377.877 311.253 377.877 313.371 377.611 315.49L325.178 284.771C322.001 282.919 318.822 282.919 315.645 284.771L249.176 323.434ZM367.283 421.415V361.301C367.283 357.592 365.694 354.945 362.516 353.092L296.048 314.43L317.763 301.982C319.617 300.925 321.206 300.925 323.058 301.982L373.639 331.112C388.205 339.586 398.003 357.592 398.003 375.069C398.003 395.195 386.087 413.733 367.283 421.412V421.415ZM233.553 368.452L211.838 355.742C209.986 354.684 209.19 353.095 209.19 350.975V292.718C209.19 264.383 230.905 242.932 260.301 242.932C271.423 242.932 281.748 246.641 290.49 253.26L238.321 283.449C235.146 285.303 233.555 287.951 233.555 291.659V368.455L233.553 368.452ZM280.292 395.462L249.176 377.985V340.913L280.292 323.436L311.407 340.913V377.985L280.292 395.462ZM300.286 475.968C289.163 475.968 278.837 472.259 270.097 465.64L322.264 435.449C325.441 433.597 327.03 430.949 327.03 427.239V350.445L349.011 363.155C350.865 364.213 351.66 365.802 351.66 367.922V426.179C351.66 454.514 329.679 475.965 300.286 475.965V475.968ZM237.525 416.915L186.944 387.785C172.378 379.31 162.582 361.305 162.582 343.827C162.582 323.436 174.763 305.164 193.563 297.485V357.861C193.563 361.571 195.154 364.217 198.33 366.071L264.535 404.467L242.82 416.915C240.967 417.972 239.377 417.972 237.525 416.915ZM234.614 460.343C204.689 460.343 182.71 437.833 182.71 410.028C182.71 407.91 182.976 405.792 183.238 403.672L235.405 433.863C238.582 435.715 241.763 435.715 244.938 433.863L311.407 395.466V420.622C311.407 422.742 310.612 424.331 308.758 425.389L258.179 454.519C251.293 458.491 243.083 460.343 234.611 460.343H234.614ZM300.286 491.854C332.329 491.854 359.073 469.082 365.167 438.892C394.825 431.211 413.892 403.406 413.892 375.073C413.892 356.535 405.948 338.529 391.648 325.552C392.972 319.991 393.766 314.43 393.766 308.87C393.766 271.003 363.048 242.666 327.562 242.666C320.413 242.666 313.528 243.723 306.644 246.109C294.725 234.457 278.307 227.042 260.301 227.042C228.258 227.042 201.513 249.815 195.42 280.004C165.761 287.685 146.694 315.49 146.694 343.824C146.694 362.362 154.638 380.368 168.938 393.344C167.613 398.906 166.819 404.467 166.819 410.027C166.819 447.894 197.538 476.231 233.024 476.231C240.172 476.231 247.058 475.173 253.943 472.788C265.859 484.441 282.278 491.854 300.286 491.854Z"
                fill="currentColor"
            />
        </svg>
    )
}

function ClaudeMarkIcon(props: SessionAgentIconProps): React.JSX.Element {
    return (
        <svg {...props} viewBox="0 0 125 125" fill="none" aria-hidden="true">
            <path
                d="M54.375 118.75L56.125 111L58.125 101L59.75 93L61.25 83.125L62.125 79.875L62 79.625L61.375 79.75L53.875 90L42.5 105.375L33.5 114.875L31.375 115.75L27.625 113.875L28 110.375L30.125 107.375L42.5 91.5L50 81.625L54.875 76L54.75 75.25H54.5L21.5 96.75L15.625 97.5L13 95.125L13.375 91.25L14.625 90L24.5 83.125L49.125 69.375L49.5 68.125L49.125 67.5H47.875L43.75 67.25L29.75 66.875L17.625 66.375L5.75 65.75L2.75 65.125L0 61.375L0.25 59.5L2.75 57.875L6.375 58.125L14.25 58.75L26.125 59.5L34.75 60L47.5 61.375H49.5L49.75 60.5L49.125 60L48.625 59.5L36.25 51.25L23 42.5L16 37.375L12.25 34.75L10.375 32.375L9.625 27.125L13 23.375L17.625 23.75L18.75 24L23.375 27.625L33.25 35.25L46.25 44.875L48.125 46.375L49 45.875V45.5L48.125 44.125L41.125 31.375L33.625 18.375L30.25 13L29.375 9.75C29.0417 8.625 28.875 7.375 28.875 6L32.75 0.750006L34.875 0L40.125 0.750006L42.25 2.625L45.5 10L50.625 21.625L58.75 37.375L61.125 42.125L62.375 46.375L62.875 47.75H63.75V47L64.375 38L65.625 27.125L66.875 13.125L67.25 9.125L69.25 4.375L73.125 1.87501L76.125 3.25L78.625 6.875L78.25 9.125L76.875 18.75L73.875 33.875L72 44.125H73.125L74.375 42.75L79.5 36L88.125 25.25L91.875 21L96.375 16.25L99.25 14H104.625L108.5 19.875L106.75 26L101.25 33L96.625 38.875L90 47.75L86 54.875L86.375 55.375H87.25L102.125 52.125L110.25 50.75L119.75 49.125L124.125 51.125L124.625 53.125L122.875 57.375L112.625 59.875L100.625 62.25L82.75 66.5L82.5 66.625L82.75 67L90.75 67.75L94.25 68H102.75L118.5 69.125L122.625 71.875L125 75.125L124.625 77.75L118.25 80.875L109.75 78.875L89.75 74.125L83 72.5H82V73L87.75 78.625L98.125 88L111.25 100.125L111.875 103.125L110.25 105.625L108.5 105.375L97 96.625L92.5 92.75L82.5 84.375H81.875V85.25L84.125 88.625L96.375 107L97 112.625L96.125 114.375L92.875 115.5L89.5 114.875L82.25 104.875L74.875 93.5L68.875 83.375L68.25 83.875L64.625 121.625L63 123.5L59.25 125L56.125 122.625L54.375 118.75Z"
                fill="currentColor"
            />
        </svg>
    )
}

function GeminiSparkIcon(props: SessionAgentIconProps): React.JSX.Element {
    return (
        <svg {...props} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 1.5 14.8 9.2 22.5 12 14.8 14.8 12 22.5 9.2 14.8 1.5 12 9.2 9.2 12 1.5Z" fill="currentColor" />
        </svg>
    )
}

function CursorMarkIcon(props: SessionAgentIconProps): React.JSX.Element {
    return (
        <svg {...props} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 2.5 19.25 10.5 12.6 12.8 17.8 21.5 13.6 22.5 8.7 14.4 4 18.2V2.5Z" fill="currentColor" />
        </svg>
    )
}

function OpenCodeMarkIcon(props: SessionAgentIconProps): React.JSX.Element {
    return (
        <svg {...props} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M8.2 5.1 2.6 12l5.6 6.9h3.1L6.6 12l4.7-6.9H8.2ZM15.8 5.1h-3.1l4.7 6.9-4.7 6.9h3.1l5.6-6.9-5.6-6.9ZM13.2 3 8.6 21h2.2L15.4 3h-2.2Z" fill="currentColor" />
        </svg>
    )
}
