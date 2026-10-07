import { FinalCTA } from '@/components/FinalCTA';
import { Hero } from '@/components/Hero';
import { AppBar } from '@/components/home/AppBar';
import { FaqSection } from '@/components/home/FaqSection';
import { HowPreview } from '@/components/home/HowPreview';
import { IntelligencePreview } from '@/components/home/IntelligencePreview';
import { ProblemSection } from '@/components/home/ProblemSection';
import { ProductSection } from '@/components/home/ProductSection';
import { TrustSection } from '@/components/home/TrustSection';

/**
 * The homepage is the concise story; each section has one job and hands off
 * to a dedicated page for depth:
 *   Hero → what it is · App bar → get the app · Problem → why it exists · Product → what you get
 *   How it works → the five-stage concept (/how-it-works has the detail)
 *   Intelligence → three ideas (/ai-intelligence has the detail)
 *   Trust → principles (/privacy, /security have the specifics)
 *   FAQ → the first ten questions (/faq has all of them) · Final CTA
 */
export default function Home() {
  return (
    <>
      <Hero />
      <AppBar />
      <ProblemSection />
      <ProductSection />
      <HowPreview />
      <IntelligencePreview />
      <TrustSection />
      <FaqSection />
      <FinalCTA />
    </>
  );
}
