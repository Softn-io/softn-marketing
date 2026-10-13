import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react"
import styles from "./Button.module.css"

type ButtonIntent = "primary"
type ButtonSize = "sm" | "lg"

type ButtonBaseProps = {
  children: ReactNode
  intent?: ButtonIntent | undefined
  size?: ButtonSize | undefined
  /** Layout-only classes (alignment, margins). Display, colors and radius are owned by the button. */
  className?: string | undefined
}

type ButtonAsLinkProps = ButtonBaseProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonBaseProps | "href"> & {
    href: string
  }

type ButtonAsButtonProps = ButtonBaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps> & {
    href?: undefined
  }

export type ButtonProps = ButtonAsLinkProps | ButtonAsButtonProps

const buildClasses = (
  intent: ButtonIntent,
  size: ButtonSize,
  className: string | undefined,
): string =>
  [styles.button, styles[`intent-${intent}`], styles[`size-${size}`], className, "font-display text-body-sm rounded-pill"]
    .filter((value): value is string => value !== undefined && value !== "")
    .join(" ")

/**
 * Call to action. Renders an `<a>` when `href` is provided, a `<button type="button">` otherwise.
 * Intents and sizes map to the Softn button tokens in the component's own stylesheet.
 */
export const Button = (props: ButtonProps) => {
  if (props.href !== undefined) {
    const { intent = "primary", size = "sm", className, children, ...anchorProps } = props
    return (
      <a {...anchorProps} className={buildClasses(intent, size, className)}>
        {children}
      </a>
    )
  }

  const { intent = "primary", size = "sm", className, children, type, ...buttonProps } = props
  return (
    <button {...buttonProps} type={type ?? "button"} className={buildClasses(intent, size, className)}>
      {children}
    </button>
  )
}
