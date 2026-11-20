'use client'

import { Switch as BaseSwitch } from '@base-ui/react/switch'
import styles from './Switch.module.css'

/** Props of {@link Switch}. */
type SwitchProps = {
  /** Whether the switch is on. */
  checked: boolean
  /** Called with the next state when the user activates the switch. */
  onCheckedChange: (checked: boolean) => void
  /** Accessible name of the switch. */
  'aria-label': string
  /** Layout-only classes. Display, colors and sizing are owned by the switch. */
  className?: string | undefined
}

/**
 * Shareable switch built on the Base UI Switch primitive. It renders a native switch role with the
 * library's own ARIA and keyboard handling, and reproduces the look of the Altcha contact-form
 * switch from the same tokens: pill track and thumb, input background and border colors, and the
 * input focus ring. The label is the only text the caller supplies, through `aria-label`.
 *
 * @param props The controlled state, the change handler and the accessible name.
 * @returns The switch.
 */
export const Switch = ({ checked, onCheckedChange, 'aria-label': ariaLabel, className }: SwitchProps) => (
  <BaseSwitch.Root
    checked={checked}
    onCheckedChange={onCheckedChange}
    aria-label={ariaLabel}
    className={[styles.switch, className]
      .filter((value): value is string => value !== undefined && value !== '')
      .join(' ')}
  >
    <BaseSwitch.Thumb className={styles.thumb} />
  </BaseSwitch.Root>
)
