import React from 'react';

import { HomeCategories } from '../../components/home/HomeCategories';
import { HomeClassic } from '../../components/home/HomeClassic';
import { HomeV2 } from '../../components/home/HomeV2';
import { HOME_VARIANT } from '../../config/homeVariant';

/**
 * Home. The new Home (what changed, with graphs) is the default. The previous
 * design is kept, unchanged, and comes back with EXPO_PUBLIC_HOME_VARIANT=classic
 * (a build setting; see config/homeVariant.ts) until the new one is proven.
 */
export default function HomeScreen() {
  if (HOME_VARIANT === 'classic') return <HomeClassic />;
  if (HOME_VARIANT === 'categories') return <HomeCategories />;
  return <HomeV2 />;
}
