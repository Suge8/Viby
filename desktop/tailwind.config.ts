import type { Config } from 'tailwindcss';
import { fontFamily } from 'tailwindcss/defaultTheme';

export default {
    darkMode: 'class',
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                background: '#050506',
                'surface-raised': '#0a0a0c',
                'surface-item': 'rgba(255, 255, 255, 0.05)',
                border: 'rgba(255, 255, 255, 0.08)',
                'text-primary': '#EDEDEF',
                'text-secondary': '#8A8F98',
                'accent-primary': '#5E6AD2',
                'accent-glow': 'rgba(94, 106, 210, 0.2)',
            },
            fontFamily: {
                sans: ['"Manrope"', '"Avenir Next"', '"SF Pro Display"', ...fontFamily.sans],
            },
            borderRadius: {
                DEFAULT: '16px',
                lg: '16px',
                md: '12px',
                sm: '8px',
            },
            keyframes: {
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
            },
            animation: {
                'fade-in': 'fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            },
        },
    },
    plugins: [],
} satisfies Config;
