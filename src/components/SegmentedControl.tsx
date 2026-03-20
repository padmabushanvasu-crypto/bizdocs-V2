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
  const n = options.length
  const activeColor = options[activeIndex]?.color ?? '#0F172A'

  return (
    <div
      className={`inline-flex bg-slate-100 rounded-xl p-1 relative isolate ${className ?? ''}`}
    >
      {/* Sliding pill */}
      <div
        style={{
          position: 'absolute',
          top: 4,
          height: 'calc(100% - 8px)',
          width: `calc((100% - 8px) / ${n})`,
          left: `calc(${activeIndex} * (100% - 8px) / ${n} + 4px)`,
          background: activeColor,
          borderRadius: 9,
          boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
          transition: 'left 0.22s cubic-bezier(0.4,0,0.2,1), background 0.22s ease',
          zIndex: 0,
        }}
      />

      {options.map((opt) => {
        const isActive = opt.value === value
        const inactiveColor = opt.color ?? '#64748B'

        return (
          <button
            key={opt.value}
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
