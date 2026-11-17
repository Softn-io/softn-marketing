import { describe, expect, it } from 'vitest'
import { hasJsonContentType, isSameOriginRequest } from './guard'

/** One request to the booking endpoints, as `isSameOriginRequest` sees it. */
const request = (headers: Record<string, string> = {}): Request =>
  new Request('http://localhost:3000/api/booking', {
    method: 'POST',
    headers,
  })

describe('isSameOriginRequest', () => {
  it('accepts a request whose origin is the endpoint origin', () => {
    expect(isSameOriginRequest(request({ origin: 'http://localhost:3000' }))).toBe(true)
  })

  it('refuses a request from another origin', () => {
    expect(isSameOriginRequest(request({ origin: 'https://evil.example' }))).toBe(false)
  })

  it('refuses a request that carries neither origin nor fetch-site header (not a browser)', () => {
    expect(isSameOriginRequest(request())).toBe(false)
    expect(isSameOriginRequest(request({ 'sec-fetch-site': 'none' }))).toBe(false)
  })

  it('accepts a browser request that keeps the fetch-site header instead of the origin', () => {
    expect(isSameOriginRequest(request({ 'sec-fetch-site': 'same-origin' }))).toBe(true)
  })

  it('refuses a request whose fetch-site header shows a cross-site context', () => {
    expect(isSameOriginRequest(request({ 'sec-fetch-site': 'cross-site' }))).toBe(false)
  })

  it('refuses a cross-site fetch-site header even when the origin matches', () => {
    expect(isSameOriginRequest(request({ origin: 'http://localhost:3000', 'sec-fetch-site': 'cross-site' }))).toBe(
      false,
    )
  })
})

describe('hasJsonContentType', () => {
  it('accepts the application/json body the flow sends', () => {
    expect(hasJsonContentType(request({ 'content-type': 'application/json' }))).toBe(true)
  })

  it('accepts a JSON content type with a charset, whatever its case', () => {
    expect(hasJsonContentType(request({ 'content-type': 'Application/JSON; charset=utf-8' }))).toBe(true)
  })

  it('refuses a form body and a request without a content type', () => {
    expect(hasJsonContentType(request({ 'content-type': 'text/plain' }))).toBe(false)
    expect(hasJsonContentType(request({ 'content-type': 'application/x-www-form-urlencoded' }))).toBe(false)
    expect(hasJsonContentType(request())).toBe(false)
  })
})
