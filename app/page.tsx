import { Header } from '@components/layout/Header'
import { Hero } from '@components/sections/Hero'
import { SECTION_IDS } from '@/lib/anchors'

/**
 * Foundation shell: the page sections land in their own issues and mount inside `<main>`.
 */
const Home = () => {
  return (
    <>
      <Header />
      <main id={SECTION_IDS.main} className="flex flex-1 flex-col bg-base text-foreground">
        <Hero />
      </main>
    </>
  )
}

export default Home
