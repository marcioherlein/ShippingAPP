import React from 'react'

type Props = {
  label: string
  value: number
  step?: number
  prefix?: string
  suffix?: string
  onChange: (value: number) => void
}

export default function NumberField({ label, value, step = 1, prefix, suffix, onChange }: Props) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-wrap">
        {prefix && <small>{prefix}</small>}
        <input
          type="number"
          value={value}
          min="0"
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {suffix && <small>{suffix}</small>}
      </div>
    </label>
  )
}
