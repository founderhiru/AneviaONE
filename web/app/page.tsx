import { AskHealthSection } from '@/components/AskHealthSection';
import { FamilySection } from '@/components/FamilySection';
import { FinalCTA } from '@/components/FinalCTA';
import { HealthMemorySection } from '@/components/HealthMemorySection';
import { Hero } from '@/components/Hero';
import { HowItWorks } from '@/components/HowItWorks';
import { IntelligenceSection } from '@/components/IntelligenceSection';
import { PrivacySection } from '@/components/PrivacySection';
import { ProblemSection } from '@/components/ProblemSection';
import { ProductShowcase } from '@/components/ProductShowcase';
import { WhatsAppSection } from '@/components/WhatsAppSection';

/**
 * Home narrative:
 * scattered records → one health memory → AI intelligence →
 * trends + changes + patterns → ask your health history.
 */
export default function Home() {
  return (
    <>
      <Hero />
      <ProblemSection />
      <HealthMemorySection />
      <IntelligenceSection />
      <HowItWorks />
      <ProductShowcase />
      <AskHealthSection />
      <WhatsAppSection />
      <PrivacySection />
      <FamilySection />
      <FinalCTA />
    </>
  );
}
