import { SECTION_IDS } from '@/lib/anchors'
import { thisSite } from '@/locales/fr/thisSite'
import { ThisSiteTabs } from './ThisSiteTabs'
import { ThisSiteTotal } from './ThisSiteTotal'
import { thisSiteLabels, thisSiteSteps } from './data/thisSiteSteps'
import styles from './styles/ThisSite.module.css'

/** Id of the heading that names the section, also given to the tab list. */
const HEADING_ID = 'this-site-title'

/**
 * "Ce site" section: eyebrow, the single `<h2>`, the interaction hint that follows the input the
 * visitor uses, then the six build steps as vertical tabs — the list on the left, the detail of the
 * selected step beside it and the measured total under the list.
 *
 * Every string comes from `locales/fr/thisSite.ts`, read here and in {@link ThisSiteTotal}; the
 * steps, their labels and the total reach the island as props, so it ships no locale. Only
 * {@link ThisSiteTabs} is client code.
 */
export const ThisSite = () => (
  <section id={SECTION_IDS.thisSite} aria-labelledby={HEADING_ID}>
    <div className={`${styles.content} mx-auto max-w-6xl`}>
      <p className="text-caption text-foreground-tertiary uppercase">{thisSite.eyebrow}</p>
      <h2 id={HEADING_ID} className={`${styles.title} font-display text-display-md text-foreground sm:text-display-lg`}>
        {thisSite.title}
      </h2>
      <p className={`${styles.intro} text-body-md text-foreground-secondary`}>
        <span className={styles.introHover}>{thisSite.intro}</span>
        <span className={styles.introTouch}>{thisSite.introTouch}</span>
        <span className={styles.introKeyboard}>{thisSite.introKeyboard}</span>
      </p>
      <ThisSiteTabs steps={thisSiteSteps} labels={thisSiteLabels} labelledBy={HEADING_ID} total={<ThisSiteTotal />} />
    </div>
  </section>
)
