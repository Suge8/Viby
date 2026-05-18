import agent from './en-agent'
import primary from './en-primary'
import secondary from './en-secondary'

export default {
    ...primary,
    ...secondary,
    ...agent,
} as const
