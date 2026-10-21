import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Button.module.css'

type ButtonIntent = 'primary'
type ButtonSize = 'sm' | 'lg'

type ButtonBaseProps = {
  children: ReactNode
  intent?: ButtonIntent | undefined
  size?: ButtonSize | undefined
  /** Layout-only classes (alignment, margins). Display, colors and radius are owned by the button. */
  className?: string | undefined
}

type ButtonAsLinkProps = ButtonBaseProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonBaseProps | 'href'> & {
    href: string
  }

type ButtonAsButtonProps = ButtonBaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps> & {
    href?: undefined
  }

export type ButtonProps = ButtonAsLinkProps | ButtonAsButtonProps

/*
 * Type step per size, as the design system's Button does: the small button takes the body-sm step
 * and the large one body-md, for the font size (14px / 16px) and the letter spacing. Each step also
 * carries its own line-height (1.7 at 14px, 1.5 at 16px), which `leading-none` overrides in the
 * markup: the design system's Button renders the label at line-height 1 at every size, so the two
 * type steps are used for their size and tracking only.
 */
const TYPE_STEP_BY_SIZE = {
  sm: 'text-body-sm',
  lg: 'text-body-md',
} as const satisfies Record<ButtonSize, string>

/* Line-height 1 and the body family come first in the design system's Button: the label never adds
 * leading to the token height of the size scale, and it uses the body face, not the display one. */
const BASE_CLASSES = 'font-body leading-none font-semibold rounded-pill'

const buildClasses = (intent: ButtonIntent, size: ButtonSize, className: string | undefined): string =>
  [styles.button, styles[`intent-${intent}`], styles[`size-${size}`], className, BASE_CLASSES, TYPE_STEP_BY_SIZE[size]]
    .filter((value): value is string => value !== undefined && value !== '')
    .join(' ')

/**
 * Call to action. Renders an `<a>` when `href` is provided, a `<button type="button">` otherwise.
 * Intents map to the Softn button color tokens and sizes to the size scale (height and padding) in
 * the component's own stylesheet, plus the matching type step (body-sm for `sm`, body-md for `lg`).
 * The label keeps the design system's Button typography: body face, weight 600, line-height 1.
 */
export const Button = (props: ButtonProps) => {
  if (props.href !== undefined) {
    const { intent = 'primary', size = 'sm', className, children, ...anchorProps } = props
    return (
      <a {...anchorProps} className={buildClasses(intent, size, className)}>
        {children}
      </a>
    )
  }

  const { intent = 'primary', size = 'sm', className, children, type, ...buttonProps } = props
  return (
    <button {...buttonProps} type={type ?? 'button'} className={buildClasses(intent, size, className)}>
      {children}
    </button>
  )
}
