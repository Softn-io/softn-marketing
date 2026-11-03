/**
 * Test-only signing secret of the booking manage links.
 *
 * This value is **not a real secret**: it is a fixed, public fixture that only exists so the
 * manage suite (`e2e/bookingManage.spec.ts`) and the webServer of `playwright.config.ts` can sign
 * and verify tokens with the same value when `BOOKING_LINK_SECRET` is not set in the environment
 * of the command. It must never be used by a deployment, written to a `.env*` file, or mistaken
 * for a credential.
 */
export const BOOKING_LINK_TEST_SECRET = 'e2e-test-only-booking-link-secret-not-a-real-credential-0000000000000000'

/**
 * Resolves the secret the manage suite and the webServer share.
 *
 * @returns `BOOKING_LINK_SECRET` from the environment of the command when it is set and
 *   non-empty, otherwise {@link BOOKING_LINK_TEST_SECRET}.
 */
export const resolveBookingLinkSecret = (): string => process.env.BOOKING_LINK_SECRET || BOOKING_LINK_TEST_SECRET
