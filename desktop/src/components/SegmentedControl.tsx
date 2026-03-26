import { useState, useRef, useLayoutEffect, type JSX } from 'react';

interface SegmentedOption {
    value: string;
    label: string;
}

interface SegmentedControlProps {
    options: readonly SegmentedOption[];
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}

export function SegmentedControl({
    options,
    value,
    onChange,
    disabled = false,
}: SegmentedControlProps): JSX.Element {
    const [activePillStyle, setActivePillStyle] = useState({ left: 0, width: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

    useLayoutEffect(() => {
        const activeIndex = options.findIndex((option) => option.value === value);
        const activeBtn = buttonRefs.current[activeIndex];

        if (activeBtn && containerRef.current) {
            const { offsetLeft, offsetWidth } = activeBtn;
            setActivePillStyle({ left: offsetLeft, width: offsetWidth });
        }
    }, [value, options]);

    return (
        <div
            ref={containerRef}
            className={`relative flex items-center p-1 ${disabled ? 'opacity-50' : ''}`}
        >
            {/* The animated "pill" */}
            <div
                className="absolute h-[calc(100%-8px)] bg-surface-item rounded-md border border-border transition-all duration-300"
                style={{
                    ...activePillStyle,
                    transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                }}
            />
            {options.map((option, index) => {
                const active = option.value === value;
                return (
                    <button
                        ref={(el) => {
                            buttonRefs.current[index] = el;
                        }}
                        aria-selected={active}
                        className={`relative z-10 rounded-md px-3 py-1 text-sm font-medium transition-colors duration-200 ${
                            active ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
                        }`}
                        disabled={disabled}
                        key={option.value}
                        onClick={() => onChange(option.value)}
                        type="button"
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
