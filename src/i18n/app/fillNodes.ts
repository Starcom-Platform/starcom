/**
 * A message with elements in it (decision D-ML, L3): "From {page}, captured {when}." with a link and a
 * time in their places, wherever a language puts them, since word order differs between languages.
 */
import { Fragment, createElement, type ReactNode } from 'react';

export function fillNodes(template: string, nodes: Record<string, ReactNode>): ReactNode {
  const parts = template.split(/\{(\w+)\}/);
  return createElement(Fragment, null, ...parts.map((part, i) => (i % 2 === 1
    ? createElement(Fragment, { key: i }, part in nodes ? nodes[part] : `{${part}}`)
    : part)));
}
