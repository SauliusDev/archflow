import React, { useEffect, useRef, useState } from 'react'

export type Direction = 'TD' | 'BT' | 'LR' | 'RL'
export type MermaidTheme = 'default' | 'dark' | 'forest' | 'neutral'
export type CurveStyle = 'basis' | 'linear' | 'cardinal'
export type Look = 'classic' | 'handDrawn'

export interface PreviewBarProps {
  direction: Direction
  theme: MermaidTheme
  curve: CurveStyle
  look: Look
  zoom: number
  onDirectionChange: (d: Direction) => void
  onThemeChange: (t: MermaidTheme) => void
  onCurveChange: (c: CurveStyle) => void
  onLookChange: (l: Look) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  onExport: () => void
}

const DIRECTIONS: Direction[] = ['TD', 'BT', 'LR', 'RL']
const THEMES: MermaidTheme[] = ['default', 'dark', 'forest', 'neutral']
const CURVES: CurveStyle[] = ['basis', 'linear', 'cardinal']

export default function PreviewBar(props: PreviewBarProps): React.JSX.Element {
  const [openDropdown, setOpenDropdown] = useState<'direction' | 'theme' | 'curve' | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenDropdown(null)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const toggleDropdown = (name: 'direction' | 'theme' | 'curve') =>
    setOpenDropdown(prev => (prev === name ? null : name))

  return (
    <div ref={barRef} className="preview-bar">
      <div className="preview-bar__dropdown-wrapper">
        <button className="preview-bar__button" onClick={() => toggleDropdown('direction')}>
          {props.direction}
        </button>
        {openDropdown === 'direction' && (
          <div className="preview-bar__dropdown">
            {DIRECTIONS.map(d => (
              <button
                key={d}
                className={`preview-bar__dropdown-option${props.direction === d ? ' preview-bar__dropdown-option--active' : ''}`}
                onClick={() => { props.onDirectionChange(d); setOpenDropdown(null) }}
              >{d}</button>
            ))}
          </div>
        )}
      </div>

      <div className="preview-bar__divider" />

      <div className="preview-bar__dropdown-wrapper">
        <button className="preview-bar__button" onClick={() => toggleDropdown('theme')}>
          {props.theme}
        </button>
        {openDropdown === 'theme' && (
          <div className="preview-bar__dropdown">
            {THEMES.map(t => (
              <button
                key={t}
                className={`preview-bar__dropdown-option${props.theme === t ? ' preview-bar__dropdown-option--active' : ''}`}
                onClick={() => { props.onThemeChange(t); setOpenDropdown(null) }}
              >{t}</button>
            ))}
          </div>
        )}
      </div>

      <div className="preview-bar__divider" />

      <div className="preview-bar__dropdown-wrapper">
        <button className="preview-bar__button" onClick={() => toggleDropdown('curve')}>
          {props.curve}
        </button>
        {openDropdown === 'curve' && (
          <div className="preview-bar__dropdown">
            {CURVES.map(c => (
              <button
                key={c}
                className={`preview-bar__dropdown-option${props.curve === c ? ' preview-bar__dropdown-option--active' : ''}`}
                onClick={() => { props.onCurveChange(c); setOpenDropdown(null) }}
              >{c}</button>
            ))}
          </div>
        )}
      </div>

      <div className="preview-bar__divider" />

      <button
        className={`preview-bar__button${props.look === 'handDrawn' ? ' preview-bar__button--active' : ''}`}
        onClick={() => props.onLookChange(props.look === 'handDrawn' ? 'classic' : 'handDrawn')}
        title="Toggle hand-drawn style"
      >Sketch</button>

      <div className="preview-bar__divider" />

      <button className="preview-bar__button" onClick={props.onZoomOut} title="Zoom out">−</button>
      <button
        className="preview-bar__button preview-bar__zoom-label"
        onClick={props.onZoomReset}
        title="Reset zoom"
      >{Math.round(props.zoom * 100)}%</button>
      <button className="preview-bar__button" onClick={props.onZoomIn} title="Zoom in">+</button>

      <div className="preview-bar__divider" />

      <button className="preview-bar__button" onClick={props.onExport} title="Export SVG">↓</button>
    </div>
  )
}
