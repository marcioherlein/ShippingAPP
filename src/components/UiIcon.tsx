import React from 'react'

export type UiIconName = 'product' | 'search' | 'sparkles' | 'external-link' | 'edit' | 'arrow-right' | 'check' | 'warning'

type Props = {
  name: UiIconName
  size?: number
  className?: string
}

const paths: Record<UiIconName, React.ReactNode> = {
  product: <><path d="M4.5 7.5 12 3l7.5 4.5v9L12 21l-7.5-4.5z"/><path d="M4.8 7.7 12 12l7.2-4.3M12 12v9"/></>,
  search: <><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.2 4.2"/></>,
  sparkles: <><path d="M12 3.5 13.4 8l4.6 1.4-4.6 1.4L12 15.5l-1.4-4.7L6 9.4 10.6 8z"/><path d="m18 15 .7 2.3L21 18l-2.3.7L18 21l-.7-2.3L15 18l2.3-.7z"/></>,
  'external-link': <><path d="M14 5h5v5"/><path d="m19 5-8 8"/><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></>,
  edit: <><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m14 8 3 3"/></>,
  'arrow-right': <><path d="M5 12h14"/><path d="m14 7 5 5-5 5"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  warning: <><path d="M12 4 21 20H3z"/><path d="M12 9v5M12 17.2v.1"/></>,
}

export default function UiIcon({ name, size = 18, className }: Props) {
  return <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >{paths[name]}</svg>
}
