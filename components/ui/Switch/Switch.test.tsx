// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Switch } from './Switch'

afterEach(cleanup)

describe('Switch', () => {
  it('renders a switch with its accessible name', () => {
    render(<Switch checked={false} onCheckedChange={() => {}} aria-label="Mesure d'audience" />)

    const control = screen.getByRole('switch', { name: "Mesure d'audience" })
    expect(control.getAttribute('aria-checked')).toBe('false')
  })

  it('reflects the checked state', () => {
    render(<Switch checked onCheckedChange={() => {}} aria-label="Mesure d'audience" />)

    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
  })

  it('reports the next state when clicked', () => {
    const onCheckedChange = vi.fn()
    render(<Switch checked={false} onCheckedChange={onCheckedChange} aria-label="Mesure d'audience" />)

    fireEvent.click(screen.getByRole('switch'))

    expect(onCheckedChange).toHaveBeenCalledTimes(1)
    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything())
  })
})
