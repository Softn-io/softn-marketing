/** Copy of the minimal page chrome (`MinimalHeader`), shared by the standalone pages. */
export const minimalHeader = {
  backLink: {
    label: 'Retour au site',
  },
} as const

export type MinimalHeader = typeof minimalHeader
