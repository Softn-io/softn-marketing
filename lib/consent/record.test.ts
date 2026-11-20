import { describe, expect, it } from 'vitest'
import {
  CONSENT_SCHEMA_VERSION,
  CONSENT_STORAGE_KEY,
  parseConsentRecord,
  parseStoredConsent,
  readConsentRecord,
  writeConsentRecord,
  type ConsentRecord,
} from './record'

const DECIDED_AT = '2026-01-15T10:00:00.000Z'
const DECIDED_AT_TIME = Date.parse(DECIDED_AT)

/** Minimal in-memory `Storage` for the tests: no browser, no shared state. */
const createMemoryStorage = (): Storage => {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => {
      data.clear()
    },
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => {
      data.delete(key)
    },
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
}

const validRecord: ConsentRecord = {
  version: CONSENT_SCHEMA_VERSION,
  audience: true,
  decidedAt: DECIDED_AT,
}

describe('parseConsentRecord', () => {
  it('accepts a valid record within its six-month lifetime', () => {
    const now = Date.parse('2026-06-15T10:00:00.000Z')

    expect(parseConsentRecord(validRecord, now)).toEqual(validRecord)
  })

  it('rejects a record whose six months are over', () => {
    const now = Date.parse('2026-07-15T10:00:00.000Z')

    expect(parseConsentRecord(validRecord, now)).toBeNull()
  })

  it('rejects a record exactly at the six-month boundary', () => {
    const expiry = new Date(DECIDED_AT)
    expiry.setUTCMonth(expiry.getUTCMonth() + 6)

    expect(parseConsentRecord(validRecord, expiry.getTime())).toBeNull()
    expect(parseConsentRecord(validRecord, expiry.getTime() - 1)).not.toBeNull()
  })

  it('rejects a decision dated in the future', () => {
    expect(parseConsentRecord(validRecord, DECIDED_AT_TIME - 1)).toBeNull()
  })

  it('rejects an unknown schema version', () => {
    expect(parseConsentRecord({ ...validRecord, version: 2 }, DECIDED_AT_TIME)).toBeNull()
  })

  it('rejects a non-boolean audience choice', () => {
    expect(parseConsentRecord({ ...validRecord, audience: 'yes' }, DECIDED_AT_TIME)).toBeNull()
  })

  it('rejects a missing or unparseable decision date', () => {
    expect(parseConsentRecord({ version: 1, audience: true }, DECIDED_AT_TIME)).toBeNull()
    expect(parseConsentRecord({ ...validRecord, decidedAt: 'not-a-date' }, DECIDED_AT_TIME)).toBeNull()
  })

  it('rejects values that are not objects', () => {
    expect(parseConsentRecord(null, DECIDED_AT_TIME)).toBeNull()
    expect(parseConsentRecord('softn-consent', DECIDED_AT_TIME)).toBeNull()
    expect(parseConsentRecord(42, DECIDED_AT_TIME)).toBeNull()
  })
})

describe('parseStoredConsent', () => {
  it('parses a valid raw record', () => {
    expect(parseStoredConsent(JSON.stringify(validRecord), DECIDED_AT_TIME)).toEqual(validRecord)
  })

  it('reads a missing key and invalid JSON as no choice', () => {
    expect(parseStoredConsent(null, DECIDED_AT_TIME)).toBeNull()
    expect(parseStoredConsent('{not json', DECIDED_AT_TIME)).toBeNull()
  })
})

describe('readConsentRecord', () => {
  it('reads a valid record from storage', () => {
    const storage = createMemoryStorage()
    storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(validRecord))

    expect(readConsentRecord(storage, DECIDED_AT_TIME)).toEqual(validRecord)
  })

  it('reads as no choice when the key is absent', () => {
    expect(readConsentRecord(createMemoryStorage(), DECIDED_AT_TIME)).toBeNull()
  })

  it('reads as no choice when the stored JSON is invalid', () => {
    const storage = createMemoryStorage()
    storage.setItem(CONSENT_STORAGE_KEY, '{not json')

    expect(readConsentRecord(storage, DECIDED_AT_TIME)).toBeNull()
  })

  it('reads as no choice when the storage throws', () => {
    const storage: Storage = {
      ...createMemoryStorage(),
      getItem: () => {
        throw new Error('storage disabled')
      },
    }

    expect(readConsentRecord(storage, DECIDED_AT_TIME)).toBeNull()
  })

  it('reads as no choice when the storage is null', () => {
    expect(readConsentRecord(null, DECIDED_AT_TIME)).toBeNull()
  })
})

describe('writeConsentRecord', () => {
  it('writes the versioned record under the consent key', () => {
    const storage = createMemoryStorage()
    const result = writeConsentRecord(storage, { audience: false }, DECIDED_AT_TIME)

    expect(result.stored).toBe(true)
    expect(result.record).toEqual({
      version: CONSENT_SCHEMA_VERSION,
      audience: false,
      decidedAt: DECIDED_AT,
    })
    expect(JSON.parse(storage.getItem(CONSENT_STORAGE_KEY) ?? 'null')).toEqual(result.record)
  })

  it('returns the record without throwing when the storage refuses the write', () => {
    const storage: Storage = {
      ...createMemoryStorage(),
      setItem: () => {
        throw new Error('quota exceeded')
      },
    }

    const result = writeConsentRecord(storage, { audience: true }, DECIDED_AT_TIME)

    expect(result.stored).toBe(false)
    expect(result.record.audience).toBe(true)
    expect(result.record.decidedAt).toBe(DECIDED_AT)
  })

  it('returns the record without throwing when the storage is null', () => {
    const result = writeConsentRecord(null, { audience: true }, DECIDED_AT_TIME)

    expect(result.stored).toBe(false)
    expect(result.record.audience).toBe(true)
  })
})
