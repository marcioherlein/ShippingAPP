import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import UiIcon from './UiIcon'

export type DsSelectOption = {
  value: string
  label: string
  hint?: string
  disabled?: boolean
}

type Props = {
  value: string
  onChange: (value: string) => void
  options: DsSelectOption[]
  placeholder?: string
  id?: string
  ariaLabel?: string
  ariaLabelledby?: string
  disabled?: boolean
  className?: string
  name?: string
}

/**
 * Accessible listbox dropdown (WAI-ARIA combobox + listbox pattern) that
 * replaces every native <select> in the app so the control matches the Apple
 * design language on all platforms instead of rendering the OS chrome.
 *
 * Keyboard: Enter/Space/↑/↓ open; ↑/↓/Home/End move the active option;
 * printable keys type-ahead; Enter selects the active option; Esc/Tab/outside
 * click close and return focus to the trigger. The popover flips above the
 * trigger when there isn't room below and scrolls when the list is tall.
 */
export default function DsSelect({
  value,
  onChange,
  options,
  placeholder = 'Seleccioná una opción',
  id,
  ariaLabel,
  ariaLabelledby,
  disabled,
  className,
  name,
}: Props) {
  const reactId = useId()
  const baseId = id ?? `ds-select-${reactId}`
  const listboxId = `${baseId}-listbox`

  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const typeaheadRef = useRef<{ query: string; at: number }>({ query: '', at: 0 })

  const [open, setOpen] = useState(false)
  const [flipUp, setFlipUp] = useState(false)
  const selectedIndex = options.findIndex((option) => option.value === value)
  const [activeIndex, setActiveIndex] = useState(selectedIndex >= 0 ? selectedIndex : 0)

  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined
  const firstEnabled = useMemo(() => options.findIndex((option) => !option.disabled), [options])

  const optionId = (index: number) => `${baseId}-option-${index}`

  const close = useCallback((focusTrigger = true) => {
    setOpen(false)
    if (focusTrigger) triggerRef.current?.focus()
  }, [])

  const openList = useCallback(() => {
    if (disabled) return
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : firstEnabled >= 0 ? firstEnabled : 0)
    setOpen(true)
  }, [disabled, selectedIndex, firstEnabled])

  const commit = useCallback((index: number) => {
    const option = options[index]
    if (!option || option.disabled) return
    onChange(option.value)
    close()
  }, [options, onChange, close])

  const moveActive = useCallback((direction: 1 | -1) => {
    setActiveIndex((current) => {
      let next = current
      for (let step = 0; step < options.length; step += 1) {
        next = (next + direction + options.length) % options.length
        if (!options[next]?.disabled) return next
      }
      return current
    })
  }, [options])

  const moveEdge = useCallback((edge: 'first' | 'last') => {
    if (edge === 'first') {
      const idx = options.findIndex((option) => !option.disabled)
      if (idx >= 0) setActiveIndex(idx)
    } else {
      for (let i = options.length - 1; i >= 0; i -= 1) {
        if (!options[i]?.disabled) { setActiveIndex(i); break }
      }
    }
  }, [options])

  const typeahead = useCallback((char: string) => {
    const now = Date.now()
    const state = typeaheadRef.current
    state.query = now - state.at > 600 ? char : state.query + char
    state.at = now
    const query = state.query.toLowerCase()
    const match = options.findIndex((option) => !option.disabled && option.label.toLowerCase().startsWith(query))
    if (match >= 0) setActiveIndex(match)
  }, [options])

  // Close on outside pointer interaction.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open])

  // Decide whether to flip the popover above the trigger, and keep the active
  // option scrolled into view.
  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    if (trigger) {
      const rect = trigger.getBoundingClientRect()
      const below = window.innerHeight - rect.bottom
      setFlipUp(below < 280 && rect.top > below)
    }
    const activeEl = listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    activeEl?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Enter':
      case ' ':
        event.preventDefault()
        openList()
        break
      default:
        break
    }
  }

  const onListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        moveActive(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        moveActive(-1)
        break
      case 'Home':
        event.preventDefault()
        moveEdge('first')
        break
      case 'End':
        event.preventDefault()
        moveEdge('last')
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        commit(activeIndex)
        break
      case 'Escape':
        event.preventDefault()
        close()
        break
      case 'Tab':
        setOpen(false)
        break
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          typeahead(event.key)
        }
        break
    }
  }

  // Focus the list when it opens so keyboard interaction works immediately.
  useEffect(() => {
    if (open) listRef.current?.focus()
  }, [open])

  return (
    <div ref={rootRef} className={`ds-select${className ? ` ${className}` : ''}`} data-open={open || undefined}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={triggerRef}
        type="button"
        id={baseId}
        className="ds-select-trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        disabled={disabled}
        data-value={value}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={`ds-select-value${selectedOption ? '' : ' is-placeholder'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <UiIcon name="chevron-down" size={18} className="ds-select-chevron" />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          className={`ds-select-popover${flipUp ? ' is-flipped' : ''}`}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby}
          aria-activedescendant={optionId(activeIndex)}
          onKeyDown={onListKeyDown}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value
            const isActive = index === activeIndex
            return (
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                data-active={isActive || undefined}
                data-value={option.value}
                className={`ds-select-option${isSelected ? ' is-selected' : ''}${option.disabled ? ' is-disabled' : ''}`}
                onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                onClick={event => {
                  // Options may live inside a label. Prevent implicit label activation
                  // from clicking the trigger again after a successful selection.
                  event.preventDefault()
                  event.stopPropagation()
                  commit(index)
                }}
              >
                <span className="ds-select-option-body">
                  <span className="ds-select-option-label">{option.label}</span>
                  {option.hint && <span className="ds-select-option-hint">{option.hint}</span>}
                </span>
                {isSelected && <UiIcon name="check" size={17} className="ds-select-option-check" />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
