'use client'

import { Accordion } from '@base-ui/react/accordion'
import { Plus } from 'lucide-react'
import type { Faq } from '@/locales/fr/faq'
import styles from './styles/FAQ.module.css'

/** Index of the question the design leaves open when the section lands; the others start closed. */
const FIRST_ITEM = 0

type FaqAccordionProps = {
  /** Questions and answers, in the locale's order: one accordion item each. */
  items: Faq['items']
}

/**
 * Interactive part of the FAQ section: the questions as an accordion. Base UI carries the
 * button/panel wiring, the `aria-expanded` state and the keyboard support, and the design's rule of
 * one open panel at a time is its default.
 *
 * The panels are `hiddenUntilFound`: every answer is in the server HTML, crawlable, and the
 * browser's own page search opens the closed panel holding a match. Only the locale's strings reach
 * this island, through `items`, so the copy of the other sections stays out of its chunk.
 */
export const FaqAccordion = ({ items }: FaqAccordionProps) => (
  <Accordion.Root hiddenUntilFound defaultValue={[FIRST_ITEM]}>
    {items.map((item, index) => (
      <Accordion.Item key={item.question} value={index} className={styles.item}>
        <Accordion.Header className={styles.header}>
          <Accordion.Trigger className={`${styles.trigger} text-foreground hover:text-brand-foreground`}>
            <span className="font-display text-title-md">{item.question}</span>
            <Plus aria-hidden="true" className={`${styles.indicator} text-brand-vivid`} />
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Panel className={styles.panel}>
          <p className={`${styles.answer} text-body-md text-foreground-secondary`}>{item.answer}</p>
        </Accordion.Panel>
      </Accordion.Item>
    ))}
  </Accordion.Root>
)
