interface SegmentedControlProps {
  options: { value: string; label: string; count?: number }[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export function SegmentedControl({ options, value, onChange, className }: SegmentedControlProps) {
  return (
    <div className={`inline-flex bg-slate-100 rounded-xl p-1 gap-1 ${className ?? ''}`}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
            value === opt.value
              ? 'bg-white text-slate-900 shadow-sm font-semibold'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {opt.label}
          {opt.count !== undefined && (
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
              value === opt.value ? 'bg-slate-100 text-slate-600' : 'bg-slate-200 text-slate-500'
            }`}>
              {opt.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
