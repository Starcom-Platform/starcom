/**
 * Compose multiple React context providers into a single wrapper.
 *
 * Usage:
 *   const CombinedProvider = composeProviders(ProviderA, ProviderB, ProviderC);
 *   // Equivalent to <ProviderA><ProviderB><ProviderC>{children}</ProviderC></ProviderB></ProviderA>
 */
import React from 'react';

type ProviderComponent = React.FC<{ children: React.ReactNode }>;

export function composeProviders(...providers: ProviderComponent[]): ProviderComponent {
  return ({ children }) =>
    providers.reduceRight(
      (acc, Provider) => React.createElement(Provider, null, acc),
      children as React.ReactElement,
    );
}
