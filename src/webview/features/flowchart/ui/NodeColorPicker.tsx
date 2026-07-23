import React, { useRef, useEffect } from 'react'
import { useStore } from '@/state/createStore'

export const NODE_COLOR_SWATCHES = [
  '#1e2022', '#1e2a3a', '#1e2a22', '#2a1e2a',
  '#2a221e', '#2a2a1e', '#1e2a2a', '#2a1e22',
] as const

// Keep these names for consumers while every color channel offers the same palette.
export const FILL_SWATCHES = NODE_COLOR_SWATCHES
export const STROKE_SWATCHES = NODE_COLOR_SWATCHES
export const TEXT_SWATCHES = NODE_COLOR_SWATCHES

interface NodeColorPickerProps {
  nodeId: string
  fillColor?: string
  strokeColor?: string
  textColor?: string
  onClose: () => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
  disabled?: boolean
}

interface SwatchSectionProps {
  label: string
  swatches: string[]
  selected?: string
  onSelect: (color: string) => void
  disabled?: boolean
}

function nativeColorValue(color?: string): string {
  return color ?? '#000000'
}

function SwatchSection({ label, swatches, selected, onSelect, disabled = false }: SwatchSectionProps): React.JSX.Element {
  return (
    <div className="node-color-picker__section">
      <span className="node-color-picker__label">{label}</span>
      <div className="node-color-picker__native-control">
        <input
          id={`node-color-picker-${label.toLowerCase()}`}
          className="node-color-picker__input"
          type="color"
          aria-label={selected ? `${label} color` : `${label} color, default theme color`}
          aria-description={selected ? undefined : 'This channel inherits the current theme until you choose a color.'}
          title={selected ?? 'Default theme color — choose a color'}
              data-inherited={selected === undefined ? true : undefined}
          value={nativeColorValue(selected)}
          disabled={disabled}
          onChange={event => onSelect(event.currentTarget.value)}
        />
        <output className="node-color-picker__value" aria-label={`${label} color value`}>
          {selected ?? 'Default'}
        </output>
      </div>
      <div className="node-color-picker__swatches" role="group" aria-label={`${label} color swatches`}>
        {swatches.map(color => (
          <button
            key={color}
            className={`node-color-picker__swatch${selected === color ? ' node-color-picker__swatch--active' : ''}`}
            style={{ background: color }}
            aria-label={`${label} color ${color}`}
            aria-pressed={selected === color}
            title={color}
            disabled={disabled}
            onClick={() => onSelect(color)}
          />
        ))}
      </div>
    </div>
  )
}

export default function NodeColorPicker({
  nodeId, fillColor, strokeColor, textColor, onClose, triggerRef, disabled = false,
}: NodeColorPickerProps): React.JSX.Element {
  const pickerRef = useRef<HTMLDivElement>(null)
  const updateNodeColors = useStore(s => s.updateNodeColors)

  useEffect(() => {
    function handleMouseDown(e: MouseEvent): void {
      if (
        pickerRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      ) return
      onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onClose, triggerRef])

  function handleFill(color: string): void {
    updateNodeColors(nodeId, { fillColor: color, strokeColor, textColor })
  }

  function handleStroke(color: string): void {
    updateNodeColors(nodeId, { fillColor, strokeColor: color, textColor })
  }

  function handleText(color: string): void {
    updateNodeColors(nodeId, { fillColor, strokeColor, textColor: color })
  }

  function handleReset(): void {
    updateNodeColors(nodeId, { fillColor: undefined, strokeColor: undefined, textColor: undefined })
  }

  return (
    <div
      ref={pickerRef}
      id="node-toolbar-color-picker"
      className="node-color-picker"
      role="dialog"
      aria-label="Node color picker"
    >
      <SwatchSection
        label="Fill"
        swatches={FILL_SWATCHES}
        selected={fillColor}
        onSelect={handleFill}
        disabled={disabled}
      />
      <SwatchSection
        label="Border"
        swatches={STROKE_SWATCHES}
        selected={strokeColor}
        onSelect={handleStroke}
        disabled={disabled}
      />
      <SwatchSection
        label="Text"
        swatches={TEXT_SWATCHES}
        selected={textColor}
        onSelect={handleText}
        disabled={disabled}
      />
      <button
        className="node-color-picker__reset"
        onClick={handleReset}
        aria-label="Reset node colors to default"
        disabled={disabled}
      >
        Reset
      </button>
    </div>
  )
}
