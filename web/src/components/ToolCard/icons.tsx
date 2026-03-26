import {
    MessageSquareIcon as SharedMessageSquareIcon,
    PuzzleIcon as SharedPuzzleIcon,
    QuestionIcon as SharedQuestionIcon,
    TerminalIcon as SharedTerminalIcon,
    UsersIcon as SharedUsersIcon,
} from '@/components/icons'
import {
    FeatureBulbIcon as SharedBulbIcon,
    FeatureCopyIcon as SharedClipboardIcon,
    FeatureEyeIcon as SharedEyeIcon,
    FeatureFileDiffIcon as SharedFileDiffIcon,
    FeatureGlobeIcon as SharedGlobeIcon,
    FeatureRocketIcon as SharedRocketIcon,
    FeatureSearchIcon as SharedSearchIcon,
    FeatureWrenchIcon as SharedWrenchIcon,
} from '@/components/featureIcons'

type IconProps = {
    className?: string
}

export function TerminalIcon(props: IconProps) {
    return <SharedTerminalIcon {...props} />
}

export function SearchIcon(props: IconProps) {
    return <SharedSearchIcon {...props} />
}

export function EyeIcon(props: IconProps) {
    return <SharedEyeIcon {...props} />
}

export function FileDiffIcon(props: IconProps) {
    return <SharedFileDiffIcon {...props} />
}

export function GlobeIcon(props: IconProps) {
    return <SharedGlobeIcon {...props} />
}

export function ClipboardIcon(props: IconProps) {
    return <SharedClipboardIcon {...props} />
}

export function BulbIcon(props: IconProps) {
    return <SharedBulbIcon {...props} />
}

export function PuzzleIcon(props: IconProps) {
    return <SharedPuzzleIcon {...props} />
}

export function RocketIcon(props: IconProps) {
    return <SharedRocketIcon {...props} />
}

export function WrenchIcon(props: IconProps) {
    return <SharedWrenchIcon {...props} />
}

export function QuestionIcon(props: IconProps) {
    return <SharedQuestionIcon {...props} />
}

export function UsersIcon(props: IconProps) {
    return <SharedUsersIcon {...props} />
}

export function MessageSquareIcon(props: IconProps) {
    return <SharedMessageSquareIcon {...props} />
}
