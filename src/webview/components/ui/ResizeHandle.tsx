import React from 'react'

interface ResizeHandleProps {
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void
}

export default function ResizeHandle({ onMouseDown }: ResizeHandleProps): React.JSX.Element {
  return (
    <div
      className="resize-handle"
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
    >
      <div className="resize-handle__grip">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}
