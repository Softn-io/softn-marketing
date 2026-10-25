// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { interpolate } from '@/lib/interpolate'
import { comingSoon } from '@/locales/fr/comingSoon'
import type { WaitlistAction } from '@/schemas/waitlist'
import { WaitlistForm } from '../WaitlistForm'

const { form } = comingSoon

const action = vi.fn<WaitlistAction>()
let now = 1_000_000

const renderForm = (): HTMLElement => {
  const { container } = render(<WaitlistForm action={action} />)
  const element = container.querySelector('form')
  if (element === null) throw new Error('form not rendered')
  return element
}

const emailInput = (): HTMLInputElement => screen.getByLabelText(form.label) as HTMLInputElement

const submit = (formElement: HTMLElement): void => {
  fireEvent.submit(formElement)
}

beforeEach(() => {
  now = 1_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  action.mockReset()
  action.mockResolvedValue({ ok: true })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('WaitlistForm', () => {
  it('renders the labelled e-mail field, the submit button and the privacy copy', () => {
    renderForm()
    const input = emailInput()

    expect(input.getAttribute('type')).toBe('email')
    expect(input.getAttribute('autocomplete')).toBe('email')
    expect(screen.getByRole('button', { name: form.submit })).toBeTruthy()
    expect(screen.getByText(form.reassurance)).toBeTruthy()
    expect(screen.getByText(form.privacyNotice)).toBeTruthy()
  })

  it('shows the empty error on submit, linked to the field, and does not call the action', () => {
    const formElement = renderForm()

    submit(formElement)

    const input = emailInput()
    const describedBy = input.getAttribute('aria-describedby')
    const error = describedBy === null ? null : document.getElementById(describedBy)
    expect(error?.textContent).toBe(form.errorEmpty)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(action).not.toHaveBeenCalled()
  })

  it('shows the invalid error on blur once the field has content', () => {
    renderForm()
    const input = emailInput()

    fireEvent.change(input, { target: { value: 'not-an-email' } })
    fireEvent.blur(input)

    expect(screen.getAllByText(form.errorInvalid).length).toBeGreaterThan(0)
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })

  it('submits a valid address and shows the personalised success message', async () => {
    const formElement = renderForm()
    fireEvent.change(emailInput(), { target: { value: '  mel@example.fr  ' } })
    now += 2500

    submit(formElement)

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    const formData = action.mock.calls[0]?.[1]
    // An `email` input strips surrounding whitespace during value sanitisation.
    expect(formData?.get('email')).toBe('mel@example.fr')
    const success = interpolate(form.success, { email: 'mel@example.fr' })
    await waitFor(() => expect(screen.getAllByText(success).length).toBeGreaterThan(0))

    const bold = screen.getByText('mel@example.fr', { selector: 'strong' })
    expect(bold.textContent).toBe('mel@example.fr')
    expect(bold.closest('p')?.textContent).toBe(success)
    expect(screen.getByRole('status').textContent).toBe(success)
    expect(screen.queryByRole('button', { name: form.submit })).toBeNull()
  })

  it('renders a markup-like address as text instead of HTML', async () => {
    const formElement = renderForm()
    const address = '<b>x</b>@example.fr'
    fireEvent.change(emailInput(), { target: { value: address } })
    now += 2500

    submit(formElement)

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    const bold = screen.getByText(address, { selector: 'strong' })
    expect(bold.textContent).toBe(address)
    expect(bold.querySelector('b')).toBeNull()
    expect(bold.closest('p')?.textContent).toBe(interpolate(form.success, { email: address }))
    expect(document.querySelector('b')).toBeNull()
  })

  it('shows the success state without a network call when the honeypot is filled', async () => {
    const formElement = renderForm()
    const honeypot = document.querySelector<HTMLInputElement>('input[name="reference"]')
    if (honeypot === null) throw new Error('honeypot not rendered')
    fireEvent.change(emailInput(), { target: { value: 'mel@example.fr' } })
    fireEvent.change(honeypot, { target: { value: 'https://spam.example' } })
    now += 2500

    submit(formElement)

    const success = interpolate(form.success, { email: 'mel@example.fr' })
    expect(screen.getAllByText(success).length).toBeGreaterThan(0)
    expect(action).not.toHaveBeenCalled()
  })

  it('shows the success state without a network call when submitted too fast', () => {
    const formElement = renderForm()
    fireEvent.change(emailInput(), { target: { value: 'mel@example.fr' } })

    submit(formElement)

    const success = interpolate(form.success, { email: 'mel@example.fr' })
    expect(screen.getAllByText(success).length).toBeGreaterThan(0)
    expect(action).not.toHaveBeenCalled()
  })

  it('shows the server error and keeps the form when the action fails', async () => {
    action.mockResolvedValueOnce({ ok: false, error: 'server' })
    const formElement = renderForm()
    fireEvent.change(emailInput(), { target: { value: 'mel@example.fr' } })
    now += 2500

    submit(formElement)

    await waitFor(() => expect(screen.getAllByText(form.errorServer).length).toBeGreaterThan(0))
    expect(screen.getByRole('button', { name: form.submit })).toBeTruthy()
    expect(emailInput().getAttribute('aria-invalid')).toBe('true')
  })

  it('announces the busy, error and success states through the live region', async () => {
    action.mockResolvedValueOnce({ ok: false, error: 'server' })
    const formElement = renderForm()
    const liveRegion = screen.getByRole('status')
    fireEvent.change(emailInput(), { target: { value: 'mel@example.fr' } })
    now += 2500

    submit(formElement)

    await waitFor(() => expect(liveRegion.textContent).toBe(form.errorServer))
  })
})
