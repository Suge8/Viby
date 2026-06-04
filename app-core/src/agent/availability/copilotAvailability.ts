import { createCommandAvailabilityDetector } from './commandAvailability'

export const detectCopilotAvailability = createCommandAvailabilityDetector('copilot', ['copilot'])
