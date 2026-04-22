import { useEffect, useRef, useState } from 'react'
import { FeatureCheckIcon as CheckIcon, FeatureTranslateIcon as TranslateIcon } from '@/components/featureIcons'
import { Button } from '@/components/ui/button'
import { type Locale, useTranslation } from '@/lib/use-translation'

const LOCALE_OPTIONS: ReadonlyArray<{ value: Locale; labelKey: 'language.english' | 'language.chinese' }> = [
    { value: 'en', labelKey: 'language.english' },
    { value: 'zh-CN', labelKey: 'language.chinese' },
]

export function LanguageSwitcher() {
    const { locale, setLocale, t } = useTranslation()
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!isOpen) {
            return
        }

        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current?.contains(event.target as Node)) {
                return
            }
            setIsOpen(false)
        }

        function handleEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setIsOpen(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('keydown', handleEscape)

        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
            document.removeEventListener('keydown', handleEscape)
        }
    }, [isOpen])

    function handleLocaleChange(nextLocale: Locale) {
        setLocale(nextLocale)
        setIsOpen(false)
    }

    return (
        <div ref={containerRef} className="relative">
            <Button
                type="button"
                size="iconSm"
                variant="secondary"
                onClick={() => setIsOpen((open) => !open)}
                className="h-10 w-10 text-[var(--app-hint)] hover:text-[var(--app-fg)]"
                title={t('language.title')}
                aria-label={t('language.title')}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
            >
                <TranslateIcon className="h-5 w-5 text-[var(--ds-accent-lime)]" />
            </Button>

            {isOpen ? (
                <div
                    className="ds-dialog-surface ds-language-switcher-menu absolute right-0 top-full z-50 mt-2 overflow-hidden rounded-[var(--ds-radius-lg)] p-1"
                    role="listbox"
                    aria-label={t('language.title')}
                >
                    {LOCALE_OPTIONS.map((option) => {
                        const isSelected = locale === option.value

                        return (
                            <Button
                                key={option.value}
                                type="button"
                                size="sm"
                                variant={isSelected ? 'secondary' : 'ghost'}
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => handleLocaleChange(option.value)}
                                className={`w-full rounded-[var(--ds-radius-md)] px-3 py-2.5 text-sm [&>[data-button-content]]:w-full [&>[data-button-content]]:justify-between ${
                                    isSelected
                                        ? 'bg-[var(--app-subtle-bg)] text-[var(--ds-text-primary)]'
                                        : 'text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                                }`}
                            >
                                <span>{t(option.labelKey)}</span>
                                {isSelected ? <CheckIcon className="h-4 w-4 text-[var(--ds-accent-lime)]" /> : null}
                            </Button>
                        )
                    })}
                </div>
            ) : null}
        </div>
    )
}
