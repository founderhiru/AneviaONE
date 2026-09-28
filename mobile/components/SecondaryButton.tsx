import React from 'react';

import { Button, type ButtonProps } from './Button';

/** Thin convenience wrapper over `Button` for the common secondary-action
 * case, kept as its own export to match the component-library naming spec. */
export function SecondaryButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="secondary" />;
}
