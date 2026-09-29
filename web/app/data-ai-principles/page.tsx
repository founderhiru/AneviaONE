import { ContentPage } from '@/components/ContentPage';
import { pageMetadata } from '@/lib/metadata';
import { PAGES } from '@/lib/pages';

export const metadata = pageMetadata('data-ai-principles');

export default function Page() {
  return <ContentPage page={PAGES['data-ai-principles']} />;
}
