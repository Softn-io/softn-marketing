// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getPreferencesPanelRequestSnapshot, resetPreferencesPanelRequest } from '@/lib/consent/preferencesPanelRequest'
import { footer } from '@/locales/fr/footer'
import { BookingManageFooter } from '../BookingManageFooter'

beforeEach(() => {
  resetPreferencesPanelRequest()
})

afterEach(() => {
  resetPreferencesPanelRequest()
  cleanup()
})

describe('BookingManageFooter', () => {
  it('renders the cookie settings control with the legal links', () => {
    render(<BookingManageFooter />)

    expect(screen.getByRole('link', { name: footer.legal.contact })).toBeTruthy()
    expect(screen.getByRole('link', { name: footer.legal.mentions })).toBeTruthy()
    expect(screen.getByRole('button', { name: footer.cookieSettings })).toBeTruthy()
  })

  it('records a preferences request from the cookie settings control', () => {
    render(<BookingManageFooter />)

    fireEvent.click(screen.getByRole('button', { name: footer.cookieSettings }))

    expect(getPreferencesPanelRequestSnapshot()).toBe(true)
  })
})
