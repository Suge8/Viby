import { useCallback, useEffect, useMemo, useState } from 'react'

import type { Machine } from '@/types/api'

interface UseMachineSelectionOptions {
    machines: Machine[]
    getRecentPaths: (machineId: string | null) => string[]
    getLastUsedMachineId: () => string | null
    onDirectoryPrefill: (directory: string) => void
}

interface MachineSelectionState {
    selectedMachine: Machine | null
    selectedMachineId: string | null
    recentPaths: string[]
    handleMachineChange: (machineId: string) => void
}

export function useMachineSelection(options: UseMachineSelectionOptions): MachineSelectionState {
    const { machines, getRecentPaths, getLastUsedMachineId, onDirectoryPrefill } = options
    const [machineId, setMachineId] = useState<string | null>(null)

    useEffect(() => {
        if (machines.length === 0) {
            if (machineId !== null) {
                setMachineId(null)
            }
            return
        }

        if (machineId && machines.some((machine) => machine.id === machineId)) {
            return
        }

        const lastUsed = getLastUsedMachineId()
        const preferredMachine = lastUsed
            ? machines.find((machine) => machine.id === lastUsed) ?? machines[0] ?? null
            : machines[0] ?? null
        if (!preferredMachine) {
            return
        }

        setMachineId(preferredMachine.id)
        const [firstPath] = getRecentPaths(preferredMachine.id)
        if (firstPath) {
            onDirectoryPrefill(firstPath)
        }
    }, [getLastUsedMachineId, getRecentPaths, machineId, machines, onDirectoryPrefill])

    const selectedMachine = useMemo(
        () => (machineId ? machines.find((machine) => machine.id === machineId) ?? null : null),
        [machineId, machines]
    )
    const selectedMachineId = selectedMachine?.id ?? null
    const recentPaths = useMemo(
        () => getRecentPaths(selectedMachineId),
        [getRecentPaths, selectedMachineId]
    )

    const handleMachineChange = useCallback((nextMachineId: string) => {
        setMachineId(nextMachineId)
        const [firstPath] = getRecentPaths(nextMachineId)
        onDirectoryPrefill(firstPath ?? '')
    }, [getRecentPaths, onDirectoryPrefill])

    return {
        selectedMachine,
        selectedMachineId,
        recentPaths,
        handleMachineChange
    }
}
