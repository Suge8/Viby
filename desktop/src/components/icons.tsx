// Desktop icon owner: lucide-react. Mirrors web's icon pattern.
// Do not introduce other icon packs for product UI.
import {
    BotMessageSquare,
    CheckCircle2,
    ChevronRight,
    Circle,
    Copy,
    Download,
    ExternalLink,
    KeyRound,
    Languages,
    Link2,
    Loader2,
    type LucideProps,
    Moon,
    Plug,
    Power,
    QrCode,
    RefreshCw,
    Settings,
    Smartphone,
    SunMedium,
    X,
} from 'lucide-react'

export type DesktopIconProps = LucideProps & {
    className?: string
}

const DEFAULT_STROKE = 1.9

function withClass(className?: string): string {
    return className ?? 'desktop-icon'
}

function strokeFor(props: DesktopIconProps): number {
    return typeof props.strokeWidth === 'number' ? props.strokeWidth : DEFAULT_STROKE
}

export function PowerIcon(props: DesktopIconProps) {
    return <Power {...props} className={withClass(props.className)} strokeWidth={strokeFor(props)} />
}

export function ConnectIcon(props: DesktopIconProps) {
    return <Plug {...props} className={withClass(props.className)} strokeWidth={strokeFor(props)} />
}

export function AgentsIcon(props: DesktopIconProps) {
    return <BotMessageSquare {...props} className={withClass(props.className)} strokeWidth={strokeFor(props)} />
}

export function SettingsIcon(props: DesktopIconProps) {
    return <Settings {...props} className={withClass(props.className)} strokeWidth={strokeFor(props)} />
}

export function PhoneIcon(props: DesktopIconProps) {
    return <Smartphone {...props} className={withClass(props.className)} strokeWidth={strokeFor(props)} />
}

export function QrIcon(props: DesktopIconProps) {
    return <QrCode {...props} className={withClass(props.className)} strokeWidth={strokeFor(props)} />
}

export function CopyIcon(props: DesktopIconProps) {
    return <Copy {...props} className={withClass(props.className)} strokeWidth={strokeFor(props)} />
}

export function OpenIcon(props: DesktopIconProps) {
    return <ExternalLink {...props} className={withClass(props.className)} strokeWidth={strokeFor(props)} />
}

export function KeyIcon(props: DesktopIconProps) {
    return <KeyRound {...props} className={withClass(props.className)} strokeWidth={strokeFor(props)} />
}

export function LinkIcon(props: DesktopIconProps) {
    return <Link2 {...props} className={withClass(props.className)} strokeWidth={strokeFor(props)} />
}

export function CheckIcon(props: DesktopIconProps) {
    return <CheckCircle2 {...props} className={withClass(props.className)} strokeWidth={strokeFor(props)} />
}

export function CircleIcon(props: DesktopIconProps) {
    return <Circle {...props} className={withClass(props.className)} strokeWidth={strokeFor(props)} />
}

export function DownloadIcon(props: DesktopIconProps) {
    return <Download {...props} className={withClass(props.className)} strokeWidth={strokeFor(props)} />
}

export function RefreshIcon(props: DesktopIconProps) {
    return <RefreshCw {...props} className={withClass(props.className)} strokeWidth={strokeFor(props)} />
}

export function CloseIcon(props: DesktopIconProps) {
    return <X {...props} className={withClass(props.className)} strokeWidth={strokeFor(props)} />
}

export function ChevronIcon(props: DesktopIconProps) {
    return <ChevronRight {...props} className={withClass(props.className)} strokeWidth={strokeFor(props)} />
}

export function SpinnerIcon(props: DesktopIconProps) {
    return (
        <Loader2
            {...props}
            className={`${withClass(props.className)} desktop-icon-spin`}
            strokeWidth={strokeFor(props)}
        />
    )
}

export function ThemeLightIcon(props: DesktopIconProps) {
    return <SunMedium {...props} className={withClass(props.className)} strokeWidth={strokeFor(props)} />
}

export function ThemeDarkIcon(props: DesktopIconProps) {
    return <Moon {...props} className={withClass(props.className)} strokeWidth={strokeFor(props)} />
}

export function LanguageIcon(props: DesktopIconProps) {
    return <Languages {...props} className={withClass(props.className)} strokeWidth={strokeFor(props)} />
}
