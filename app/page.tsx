import { Header } from "@components/sections/Header";
import { SECTION_IDS } from "@/lib/anchors";

/**
 * Foundation shell: the page sections land in their own issues and mount inside `<main>`.
 */
export default function Home() {
  return (
    <>
      <Header />
      <main id={SECTION_IDS.main} className="flex flex-1 flex-col bg-base text-foreground" />
    </>
  );
}
