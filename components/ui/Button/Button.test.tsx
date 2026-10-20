// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

afterEach(cleanup)

describe('Button', () => {
  it('renders a link when href is given', () => {
    render(<Button href="#reservation">Réserver</Button>)
    expect(screen.getByRole('link', { name: 'Réserver' }).getAttribute('href')).toBe('#reservation')
  })

  it('renders a type=button button without href', () => {
    render(<Button>Envoyer</Button>)
    expect(screen.getByRole('button', { name: 'Envoyer' }).getAttribute('type')).toBe('button')
  })

  it('lets a button opt into type=submit', () => {
    render(<Button type="submit">Envoyer</Button>)
    expect(screen.getByRole('button').getAttribute('type')).toBe('submit')
  })

  it('forwards click handlers', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Envoyer</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('applies intent, size and layout classes', () => {
    render(
      <Button href="#x" size="lg" className="self-start">
        Go
      </Button>,
    )
    const classes = screen.getByRole('link').className
    expect(classes).toContain('intent-primary')
    expect(classes).toContain('size-lg')
    expect(classes).toContain('self-start')
  })

  it('defaults to the small primary variant', () => {
    render(<Button>Go</Button>)
    const classes = screen.getByRole('button').className
    expect(classes).toContain('intent-primary')
    expect(classes).toContain('size-sm')
  })

  it('uses the body-sm step on the small size and body-md on the large one', () => {
    render(
      <Button href="#x" size="lg">
        Go
      </Button>,
    )
    const large = screen.getByRole('link').className
    expect(large).toContain('font-body')
    expect(large).toContain('leading-none')
    expect(large).toContain('text-body-md')
    expect(large).toContain('font-semibold')
    expect(large).toContain('rounded-pill')
    expect(large).not.toContain('font-display')

    cleanup()
    render(<Button href="#y">Go</Button>)
    const small = screen.getByRole('link').className
    expect(small).toContain('text-body-sm')
    expect(small).toContain('font-semibold')
    expect(small).not.toContain('text-body-md')
  })
})
