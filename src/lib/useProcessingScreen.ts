import { useLayoutEffect, useRef } from 'react'
import { startProcessing, type ProcessingDetails } from './processingScreen'

export function useProcessingScreen(active: boolean, details: ProcessingDetails) {
  const operation = useRef<ReturnType<typeof startProcessing> | null>(null)
  const latest = useRef(details)
  latest.current = details
  const stepsKey = JSON.stringify(details.steps ?? [])

  useLayoutEffect(() => {
    if (!active) return
    const task = startProcessing(latest.current)
    operation.current = task
    return () => { task.finish(); operation.current = null }
  }, [active])

  useLayoutEffect(() => {
    operation.current?.update(latest.current)
  }, [active, details.title, details.detail, details.activeStep, details.priority, stepsKey])
}
