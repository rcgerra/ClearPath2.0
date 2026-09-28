/** Stored phases and their user-facing intake workflow stages. */
export const REQUEST_WORKFLOW = [
  { phase: 'Draft', title: 'Opportunity Statement', description: 'Describe the opportunity or unmet business need.' },
  { phase: 'Prioritization', title: 'Prioritization', description: 'The sponsor answers questions to rank the idea against other planned work.' },
  { phase: 'DQ Check', title: 'DQ Check', description: 'PMO checks the data for completeness, not merit.' },
  { phase: 'PIRT Assessment', title: 'PIRT Assessment', description: 'The intake review team assigns a program and determines the project type.' },
  { phase: 'SG1 Review', title: 'SG1 Review', description: 'Governance reviews the opportunity\'s merits at Stage Gate 1.' },
  { phase: 'Configuration', title: 'Creation', description: 'PMO creates baseline records and adds the work to the plan.' },
  { phase: 'Processed', title: 'Processed', description: 'The intake process is complete.' },
] as const;

export const REQUEST_PHASES = REQUEST_WORKFLOW.map((step) => step.phase);
export type RequestPhase = (typeof REQUEST_WORKFLOW)[number]['phase'];

export const DEFAULT_REQUEST_PHASE: RequestPhase = 'Draft';

export function workflowStageIndex(phase?: string): number {
  if (!phase) return 0;
  const index = REQUEST_PHASES.indexOf(phase as RequestPhase);
  if (index !== -1) return index;
  const numbered = /^([1-7])\.\s/.exec(phase);
  if (numbered) return Number(numbered[1]) - 1;
  if (phase === 'Opportunity Statement') return 0;
  if (phase === 'Creation') return 5;
  return -1;
}

export function phaseLabel(phase?: string): string {
  if (!phase) return DEFAULT_REQUEST_PHASE;
  const index = workflowStageIndex(phase);
  return index === -1 ? phase : REQUEST_PHASES[index];
}

/** Position used to sort the Phase column by lifecycle rather than alphabetically. */
export function phaseOrder(phase?: string): number {
  const index = workflowStageIndex(phase);
  return index === -1 ? REQUEST_PHASES.length : index;
}
