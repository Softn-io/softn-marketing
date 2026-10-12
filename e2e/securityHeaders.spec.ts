import { expect, test } from "@playwright/test"

const EXPECTED_HEADERS = [
  "content-security-policy",
  "strict-transport-security",
  "referrer-policy",
  "permissions-policy",
  "x-content-type-options",
] as const

test.describe("security headers", () => {
  test("every security header is served on the page, a static chunk and the favicon", async ({ page, request }) => {
    const chunks = new Set<string>()
    page.on("response", (response) => {
      if (/\/_next\/static\/.*\.js$/.test(response.url())) chunks.add(response.url())
    })
    await page.goto("/", { waitUntil: "networkidle" })
    expect(chunks.size).toBeGreaterThan(0)

    const [chunk] = [...chunks]
    for (const url of ["/", chunk ?? "", "/favicon.ico"]) {
      const response = await request.get(url)
      expect(response.ok(), url).toBe(true)
      for (const name of EXPECTED_HEADERS) {
        expect(response.headers()[name], `${name} on ${url}`).toBeTruthy()
      }
      expect(response.headers()["strict-transport-security"]).not.toContain("preload")
    }
  })

  test("the policy blocks nothing the home page needs and no third party is requested", async ({ page }) => {
    const violations: string[] = []
    const origins = new Set<string>()
    page.on("console", (message) => {
      if (/content security policy/i.test(message.text())) violations.push(message.text())
    })
    page.on("request", (req) => origins.add(new URL(req.url()).origin))

    await page.goto("/", { waitUntil: "networkidle" })
    await page.getByRole("button", { name: /Passer au mode/ }).click()

    expect(violations).toEqual([])
    expect([...origins]).toEqual([new URL(page.url()).origin])
  })
})
