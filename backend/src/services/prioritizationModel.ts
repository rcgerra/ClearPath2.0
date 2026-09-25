import fs from 'node:fs';
import path from 'node:path';

export type PrioritizationParent = 'Impact' | 'Complexity';

export interface PrioritizationModel {
  parentWeights: Record<PrioritizationParent, number>;
}

const defaults: PrioritizationModel = { parentWeights: { Impact: 0.5, Complexity: 0.5 } };
const filePath = process.env.PRIORITIZATION_MODEL_FILE
  ?? path.resolve(process.cwd(), 'demo-data', 'prioritization-model.json');

let model = loadModel();

function loadModel(): PrioritizationModel {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<PrioritizationModel>;
    const impact = Number(parsed.parentWeights?.Impact);
    const complexity = Number(parsed.parentWeights?.Complexity);
    if (Number.isFinite(impact) && impact >= 0 && Number.isFinite(complexity) && complexity >= 0 && impact + complexity > 0) {
      return { parentWeights: { Impact: impact, Complexity: complexity } };
    }
  } catch {
    // Use defaults when the optional settings file is absent or invalid.
  }
  return structuredClone(defaults);
}

export function getPrioritizationModel(): PrioritizationModel {
  return structuredClone(model);
}

export function updatePrioritizationModel(parentWeights: Record<PrioritizationParent, number>): PrioritizationModel {
  model = { parentWeights: { ...parentWeights } };
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(model, null, 2)}\n`, 'utf8');
  } catch (error) {
    console.warn('Could not persist prioritization model settings; the change is kept in memory only.', error);
  }
  return getPrioritizationModel();
}

export function combineParentScores(impactScore: number, complexityScore: number): number {
  const { Impact: impactWeight, Complexity: complexityWeight } = model.parentWeights;
  const totalWeight = impactWeight + complexityWeight;
  return totalWeight ? (impactScore * impactWeight + complexityScore * complexityWeight) / totalWeight : 0;
}