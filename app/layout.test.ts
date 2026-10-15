import { describe, expect, it, vi } from "vitest"
import { metadataContent } from "@/locales/fr/metadata"
import { SITE_URL } from "@/lib/site"

vi.mock("./fonts", () => ({
  plusJakartaSans: { variable: "" },
  zalandoSans: { variable: "" },
}))
vi.mock("./globals.css", () => ({}))

describe("root layout metadata", () => {
  it("takes title and description from the validated home copy", async () => {
    const { metadata } = await import("./layout")

    expect(metadata.title).toBe(metadataContent.home.title)
    expect(metadata.description).toBe(metadataContent.home.description)
  })

  it("sets OpenGraph, canonical, robots and base URL", async () => {
    const { metadata } = await import("./layout")

    expect(String(metadata.metadataBase)).toBe(`${SITE_URL}/`)
    expect(metadata.alternates?.canonical).toBe("/")
    expect(metadata.robots).toEqual({ index: true, follow: true })
    expect(metadata.openGraph).toMatchObject({
      type: "website",
      url: "/",
      title: metadataContent.home.openGraph.title,
      description: metadataContent.home.openGraph.description,
      locale: metadataContent.home.openGraph.locale,
    })
  })
})
