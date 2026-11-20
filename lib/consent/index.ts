export {
  CONSENT_LIFETIME_MONTHS,
  CONSENT_SCHEMA_VERSION,
  CONSENT_STORAGE_KEY,
  parseConsentRecord,
  parseStoredConsent,
  readConsentRecord,
  writeConsentRecord,
  type ConsentChoice,
  type ConsentRecord,
  type ConsentSaveResult,
} from './record'
export { consentStore, createConsentStore, type ConsentStore } from './store'
