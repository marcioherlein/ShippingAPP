import React from 'react'

type Props = {
  label: string
  value: number
  step?: number
  prefix?: string
  suffix?: string
  onChange: (value: number) => void
  readOnly?: boolean
}

export default function NumberField({ label, value, step = 1, prefix, suffix, onChange, readOnly = false }: Props) {
  return (
    <label className={`field${readOnly ? ' read-only' : ''}`}>
      <span>{label}</span>
      <div className="input-wrap">
        {prefix && <small>{prefix}</small>}
        <input
          type="number"
          value={value}
          min="0"
          step={step}
          readOnly={readOnly}
          aria-readonly={readOnly}
          onChange={(event) => { if (!readOnly) onChange(Number(event.target.value)) }}
        />
        {suffix && <small>{suffix}</small>}
      </div>
    </label>
  )
}
