/** Request lifecycle, in order. New requests start at Draft. */
export const REQUEST_PHASES = [
  'Draft',
  'Prioritization',
  'DQ Check',
  'PIRT Assessment',
  'SG1 Review',
  'Configuration',
  'Processed',
] as const;

export type RequestPhase = (typeof REQUEST_PHASES)[number];

export const DEFAULT_REQUEST_PHASE: RequestPhase = 'Draft';

/** Position used to sort the Phase column by lifecycle rather than alphabetically. */
export function phaseOrder(phase?: string): number {
  const index = REQUEST_PHASES.indexOf((phase ?? '') as RequestPhase);
  return index === -1 ? REQUEST_PHASES.length : index;
}
