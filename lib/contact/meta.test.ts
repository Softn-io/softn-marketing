import { describe, expect, it } from 'vitest'
import { contactRobots } from './meta'

describe('contactRobots', () => {
  it('reads the directives of the validated copy', () => {
    expect(contactRobots('index, follow')).toEqual({ index: true, follow: true })
  })

  it('reads the negative directives without a special case', () => {
    expect(contactRobots('noindex, nofollow')).toEqual({ index: false, follow: false })
    expect(contactRobots('index, nofollow')).toEqual({ index: true, follow: false })
    expect(contactRobots('')).toEqual({ index: false, follow: false })
  })
})
