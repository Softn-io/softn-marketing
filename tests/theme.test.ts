import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"
import { THEME_STORAGE_KEY, themeInitScript } from "../lib/theme"

type Attrs = Record<string, string>

function runInitScript(storage: { getItem: (key: string) => string | null }): Attrs {
  const attrs: Attrs = {}
  runInNewContext(themeInitScript, {
    localStorage: storage,
    document: {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          attrs[name] = value
        },
      },
    },
  })
  return attrs
}

describe("themeInitScript", () => {
  it("reads the documented storage key", () => {
    const keys: string[] = []
    runInitScript({
      getItem: (key) => {
        keys.push(key)
        return null
      },
    })
    expect(keys).toEqual([THEME_STORAGE_KEY])
  })

  it.each(["dark", "light"])("applies stored %s to data-theme", (stored) => {
    expect(runInitScript({ getItem: () => stored })).toEqual({ "data-theme": stored })
  })

  it.each([null, "", "auto", "LIGHT", "system"])("leaves data-theme absent for %j", (stored) => {
    expect(runInitScript({ getItem: () => stored })).toEqual({})
  })

  it("does not throw when storage access throws", () => {
    expect(
      runInitScript({
        getItem: () => {
          throw new Error("SecurityError")
        },
      }),
    ).toEqual({})
  })
})
