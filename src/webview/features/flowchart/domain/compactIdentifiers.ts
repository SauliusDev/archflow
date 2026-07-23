export type CompactIdentifierKind = 'node' | 'subgraph' | 'edge'

const PREFIX_BY_KIND: Record<CompactIdentifierKind, string> = {
  node: 'n',
  subgraph: 'g',
  edge: 'e',
}

const UUID = '[0-9a-f]{8}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{12}'
const BARE_UUID = new RegExp(`^${UUID}$`, 'i')
const LEGACY_PREFIX_BY_KIND: Record<Exclude<CompactIdentifierKind, 'edge'>, RegExp> = {
  node: new RegExp(`^N_${UUID}$`, 'i'),
  subgraph: new RegExp(`^(?:SG|Lane)_${UUID}$`, 'i'),
}

export function allocateCompactIdentifier(kind: CompactIdentifierKind, occupied: ReadonlySet<string>): string {
  const prefix = PREFIX_BY_KIND[kind]
  let suffix = 1

  while (occupied.has(`${prefix}${suffix}`)) {
    suffix += 1
  }

  return `${prefix}${suffix}`
}

export function isLegacyGeneratedIdentifier(
  identifier: string,
  kind: Exclude<CompactIdentifierKind, 'edge'>,
): boolean {
  return BARE_UUID.test(identifier) || LEGACY_PREFIX_BY_KIND[kind].test(identifier)
}
