import React, { useEffect } from 'react'
import { useStore } from '@/state/createStore'

export default function LiveRegion(): React.JSX.Element {
  const announcement = useStore(s => s.announcement)
  const clearAnnouncement = useStore(s => s.clearAnnouncement)

  useEffect(() => {
    if (!announcement) return
    const timer = setTimeout(clearAnnouncement, 500)
    return () => clearTimeout(timer)
  }, [announcement, clearAnnouncement])

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {announcement}
    </div>
  )
}
