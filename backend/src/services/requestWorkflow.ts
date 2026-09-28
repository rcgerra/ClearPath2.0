export const REQUEST_STAGES = [
  'Draft', 'Prioritization', 'DQ Check', 'PIRT Assessment', 'SG1 Review', 'Configuration', 'Processed',
] as const;

export function requestStageIndex(phase?: string | null): number {
  if (!phase) return 0;
  const index = REQUEST_STAGES.indexOf(phase as typeof REQUEST_STAGES[number]);
  if (index !== -1) return index;
  const numbered = /^([1-7])\.\s/.exec(phase);
  if (numbered) return Number(numbered[1]) - 1;
  if (phase === 'Opportunity Statement') return 0;
  if (phase === 'Creation') return 5;
  return -1;
}

export function completedStagesOnTransition(from?: string | null, to?: string | null): string[] {
  const previous = requestStageIndex(from);
  const next = requestStageIndex(to);
  if (previous === -1 || next <= previous) return [];
  return [REQUEST_STAGES[previous], ...(next === REQUEST_STAGES.length - 1 ? ['Processed'] : [])];
}