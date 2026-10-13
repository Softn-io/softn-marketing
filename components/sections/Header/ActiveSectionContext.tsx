"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import type { SectionId } from "@/lib/anchors"
import { useActiveSection, type ActiveSection } from "./useActiveSection"

const ActiveSectionContext = createContext<ActiveSection>({ activeId: null, select: () => undefined })

type ActiveSectionProviderProps = {
  /** Observed section ids in document order. */
  ids: readonly SectionId[]
  children: ReactNode
}

/**
 * Shares one scroll-spy between the desktop navigation and the drawer, so both highlight the same
 * link and a single observer runs. Its children stay server-rendered.
 */
export const ActiveSectionProvider = ({ ids, children }: ActiveSectionProviderProps) => {
  const { activeId, select } = useActiveSection(ids)
  const value = useMemo(() => ({ activeId, select }), [activeId, select])
  return <ActiveSectionContext.Provider value={value}>{children}</ActiveSectionContext.Provider>
}

/** Active section state; outside a provider nothing is ever active and `select` is a no-op. */
export const useActiveSectionContext = (): ActiveSection => useContext(ActiveSectionContext)
