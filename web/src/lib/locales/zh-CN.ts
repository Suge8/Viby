import agent from './zh-CN-agent'
import primary from './zh-CN-primary'
import secondary from './zh-CN-secondary'

export default {
    ...primary,
    ...secondary,
    ...agent,
} as const
