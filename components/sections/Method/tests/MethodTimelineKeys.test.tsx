// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MethodTimeline } from '../MethodTimeline'

/**
 * The locale is mocked with two steps sharing a label: with a key built from the label alone React
 * logs "Encountered two children with the same key" and may duplicate or drop a block, so the key
 * has to stay unique whatever the copy says.
 */
vi.mock('@/locales/fr/method', () => ({
  method: {
    stepCounter: '{current} / {total}',
    steps: [
      { label: 'Étape identique', title: 'Premier titre', text: 'Premier texte.' },
      { label: 'Étape identique', title: 'Second titre', text: 'Second texte.' },
    ],
  },
}))

afterEach(cleanup)

describe('MethodTimeline keys', () => {
  it('renders two steps sharing a label without a React key warning', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<MethodTimeline />)
    expect(consoleError.mock.calls).toEqual([])
    consoleError.mockRestore()
  })

  it('keeps one block per step, each carrying its own index', () => {
    render(<MethodTimeline />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items.map((item) => item.style.getPropertyValue('--method-step-index'))).toEqual(['0', '1'])
    expect(items.map((item) => item.querySelector('h3')?.textContent)).toEqual(['Premier titre', 'Second titre'])
  })
})
