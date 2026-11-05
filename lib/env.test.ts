import { afterEach, describe, expect, it, vi } from 'vitest'
import { readEnv } from './env'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('readEnv', () => {
  it('keeps an https Upstash URL and strips its trailing slash', () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://eu1-example.upstash.io/')

    expect(readEnv().UPSTASH_REDIS_REST_URL).toBe('https://eu1-example.upstash.io')
  })

  it('rejects a non-https Upstash URL', () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'http://eu1-example.upstash.io')

    expect(() => readEnv()).toThrow('UPSTASH_REDIS_REST_URL must be an https URL')
  })

  it('treats a blank Upstash variable as unset', () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '   ')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')

    const environment = readEnv()

    expect(environment.UPSTASH_REDIS_REST_URL).toBeUndefined()
    expect(environment.UPSTASH_REDIS_REST_TOKEN).toBeUndefined()
  })

  it('rejects a non-https Baserow URL', () => {
    vi.stubEnv('BASEROW_API_URL', 'http://api.baserow.io')

    expect(() => readEnv()).toThrow('BASEROW_API_URL must be an https URL')
  })

  it('keeps the booking variables of the keyless federation', () => {
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', 'booking@softn-io.iam.gserviceaccount.com')
    vi.stubEnv('GOOGLE_CALENDAR_OWNER', 'melanie@softn.io')
    // A dedicated secondary calendar holds the bookings: it is an address, like the owner.
    vi.stubEnv('GOOGLE_CALENDAR_ID', 'abc123@group.calendar.google.com')
    vi.stubEnv('GCP_PROJECT_NUMBER', '123456789012')
    vi.stubEnv('GCP_WORKLOAD_IDENTITY_POOL_ID', 'vercel')
    vi.stubEnv('GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID', 'softn-site')
    vi.stubEnv('VERCEL_OIDC_TOKEN', 'oidc-token')
    vi.stubEnv('BASEROW_LEADS_TABLE_ID', '42')
    vi.stubEnv('BOOKING_LINK_SECRET', 's'.repeat(40))

    const environment = readEnv()

    expect(environment.GOOGLE_SERVICE_ACCOUNT_EMAIL).toBe('booking@softn-io.iam.gserviceaccount.com')
    expect(environment.GOOGLE_CALENDAR_OWNER).toBe('melanie@softn.io')
    expect(environment.GOOGLE_CALENDAR_ID).toBe('abc123@group.calendar.google.com')
    expect(environment.GCP_PROJECT_NUMBER).toBe('123456789012')
    expect(environment.GCP_WORKLOAD_IDENTITY_POOL_ID).toBe('vercel')
    expect(environment.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID).toBe('softn-site')
    expect(environment.VERCEL_OIDC_TOKEN).toBe('oidc-token')
    expect(environment.BASEROW_LEADS_TABLE_ID).toBe('42')
    expect(environment.BOOKING_LINK_SECRET).toBe('s'.repeat(40))
  })

  it('treats a blank booking variable as unset', () => {
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', '  ')
    vi.stubEnv('GOOGLE_CALENDAR_OWNER', '')
    vi.stubEnv('GOOGLE_CALENDAR_ID', '')
    vi.stubEnv('GCP_PROJECT_NUMBER', '')
    vi.stubEnv('GCP_WORKLOAD_IDENTITY_POOL_ID', '')
    vi.stubEnv('GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID', '')
    vi.stubEnv('VERCEL_OIDC_TOKEN', '')
    vi.stubEnv('BASEROW_LEADS_TABLE_ID', '')
    vi.stubEnv('BOOKING_LINK_SECRET', '')

    const environment = readEnv()

    expect(environment.GOOGLE_SERVICE_ACCOUNT_EMAIL).toBeUndefined()
    expect(environment.GOOGLE_CALENDAR_OWNER).toBeUndefined()
    expect(environment.GOOGLE_CALENDAR_ID).toBeUndefined()
    expect(environment.GCP_PROJECT_NUMBER).toBeUndefined()
    expect(environment.GCP_WORKLOAD_IDENTITY_POOL_ID).toBeUndefined()
    expect(environment.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID).toBeUndefined()
    expect(environment.VERCEL_OIDC_TOKEN).toBeUndefined()
    expect(environment.BASEROW_LEADS_TABLE_ID).toBeUndefined()
    expect(environment.BOOKING_LINK_SECRET).toBeUndefined()
  })

  it('rejects a service account address that is not an address', () => {
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', 'not-an-address')

    expect(() => readEnv()).toThrow()
  })

  it('rejects a calendar id that is not an address', () => {
    vi.stubEnv('GOOGLE_CALENDAR_ID', 'primary')

    expect(() => readEnv()).toThrow()
  })

  it('rejects an owner that is not an address', () => {
    vi.stubEnv('GOOGLE_CALENDAR_OWNER', 'melanie')

    expect(() => readEnv()).toThrow()
  })

  it('rejects a project number that is not a number', () => {
    vi.stubEnv('GCP_PROJECT_NUMBER', 'softn-project')

    expect(() => readEnv()).toThrow('GCP_PROJECT_NUMBER')
  })

  it('keeps a manage link secret of at least 32 characters', () => {
    vi.stubEnv('BOOKING_LINK_SECRET', 's'.repeat(32))

    expect(readEnv().BOOKING_LINK_SECRET).toBe('s'.repeat(32))
  })

  it('rejects a manage link secret that is too short, and treats a blank one as unset', () => {
    vi.stubEnv('BOOKING_LINK_SECRET', 'too-short')

    expect(() => readEnv()).toThrow('BOOKING_LINK_SECRET')

    vi.stubEnv('BOOKING_LINK_SECRET', '   ')
    expect(readEnv().BOOKING_LINK_SECRET).toBeUndefined()
  })

  it('keeps a reminder secret of at least 32 characters, and treats a blank one as unset', () => {
    vi.stubEnv('CRON_SECRET', 'c'.repeat(32))

    expect(readEnv().CRON_SECRET).toBe('c'.repeat(32))

    vi.stubEnv('CRON_SECRET', '   ')
    expect(readEnv().CRON_SECRET).toBeUndefined()
  })

  it('rejects a reminder secret that is too short', () => {
    vi.stubEnv('CRON_SECRET', 'too-short')

    expect(() => readEnv()).toThrow('CRON_SECRET')
  })

  it('reads the deployment marker Vercel sets, and treats a blank one as unset', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(readEnv().VERCEL_ENV).toBe('production')

    vi.stubEnv('VERCEL_ENV', '   ')
    expect(readEnv().VERCEL_ENV).toBeUndefined()
  })
})
