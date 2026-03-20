import { useEffect, useRef, useState } from 'react'

interface SegmentedControlOption {
  value: string
  label: string
  count?: number
  color?: string
}

interface SegmentedControlProps {
  options: SegmentedControlOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export function SegmentedControl({ options, value, onChange, className }: SegmentedControlProps) {
  const activeIndex = options.findIndex((opt) => opt.value === value)
  const activeOption = options[activeIndex]

  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 })

  const measure = () => {
    const activeBtn = buttonRefs.current[activeIndex]
    if (activeBtn) {
      const parent = activeBtn.parentElement
      if (parent) {
        const parentRect = parent.getBoundingClientRect()
        const btnRect = activeBtn.getBoundingClientRect()
        setPillStyle({
          left: btnRect.left - parentRect.left,
          width: btnRect.width,
        })
      }
    }
  }

  // Measure on value change
  useEffect(() => {
    measure()
  }, [activeIndex, value])

  // Measure on mount after layout is complete
  useEffect(() => {
    const t = setTimeout(measure, 50)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      className={`inline-flex bg-slate-100 rounded-xl p-1 relative isolate ${className ?? ''}`}
    >
      {/* Sliding pill */}
      <div
        style={{
          position: 'absolute',
          top: 4,
          left: pillStyle.left,
          width: pillStyle.width,
          height: 'calc(100% - 8px)',
          background: activeOption?.color ?? '#0F172A',
          borderRadius: 9,
          boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
          transition: 'left 0.22s cubic-bezier(0.4,0,0.2,1), width 0.22s ease, background 0.22s ease',
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />

      {options.map((opt, i) => {
        const isActive = opt.value === value
        const inactiveColor = opt.color ?? '#64748B'

        return (
          <button
            key={opt.value}
            ref={(el) => { buttonRefs.current[i] = el }}
            onClick={() => onChange(opt.value)}
            style={{
              position: 'relative',
              zIndex: 1,
              flex: 1,
              padding: '8px 16px',
              border: 'none',
              background: 'transparent',
              borderRadius: 9,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
              fontSize: 13,
              color: isActive ? 'white' : inactiveColor,
              fontWeight: isActive ? 600 : 500,
              transition: 'color 0.22s ease',
            }}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 9,
                  transition: 'all 0.22s ease',
                  background: isActive ? 'rgba(255,255,255,0.22)' : `${inactiveColor}26`,
                  color: isActive ? 'white' : inactiveColor,
                }}
              >
                {opt.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
