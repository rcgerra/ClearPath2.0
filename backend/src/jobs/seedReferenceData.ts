import * as dv from '../dataverse/client';
import { COLUMNS } from '../dataverse/fields';

/**
 * Seeds reference data (categories, prioritization questions, functions) into the
 * MBO-Staffing-Model environment. Existing records with the same name are left alone.
 * Run with: npm run seed:dataverse
 */
const CATEGORIES = [
  { name: 'Business value', weight: 2 },
  { name: 'Risk reduction', weight: 1.5 },
  { name: 'Compliance', weight: 2.5 },
  { name: 'Efficiency', weight: 1 },
];

const QUESTIONS = [
  { text: 'How many people are affected by the problem today?', category: 'Business value', weight: 2, sequence: 1 },
  { text: 'What is the annual cost of leaving the problem unsolved?', category: 'Business value', weight: 3, sequence: 2 },
  { text: 'What is the compliance or audit exposure?', category: 'Compliance', weight: 2.5, sequence: 3 },
  { text: 'How much manual effort would this remove each month?', category: 'Efficiency', weight: 2, sequence: 4 },
  { text: 'How confident are we in the proposed approach?', category: 'Risk reduction', weight: 1, sequence: 5 },
];

const FUNCTIONS = ['Software Engineer', 'Data Analyst', 'QA Engineer', 'Project Manager', 'Business Analyst'];

async function ensureByName(table: string, nameColumn: string, name: string, extra: Record<string, unknown> = {}) {
  const existing = await dv.list(table, {
    select: [nameColumn],
    filter: `${nameColumn} eq ${dv.odataString(name)}`,
    top: 1,
    includeFormattedValues: false,
  });
  if (existing.length) {
    const idColumn = await dv.getPrimaryIdAttribute((await import('../dataverse/tables')).requireTable(table).logicalName);
    return String((existing[0] as Record<string, unknown>)[idColumn]);
  }
  return dv.create(table, { [nameColumn]: name, ...extra });
}

export async function seedReferenceData(): Promise<void> {
  const categoryIds = new Map<string, string>();
  for (const category of CATEGORIES) {
    const id = await ensureByName('categories', COLUMNS.categories.name, category.name, {
      [COLUMNS.categories.weight]: category.weight,
    });
    categoryIds.set(category.name, id);
    console.log(`Category ready: ${category.name}`);
  }

  for (const fn of FUNCTIONS) {
    await ensureByName('functions', COLUMNS.functions.name, fn);
    console.log(`Function ready: ${fn}`);
  }

  const Q = COLUMNS.questions;
  for (const question of QUESTIONS) {
    const existing = await dv.list('questions', {
      select: [Q.id],
      filter: `${Q.text} eq ${dv.odataString(question.text)}`,
      top: 1,
      includeFormattedValues: false,
    });
    if (existing.length) {
      console.log(`Question already present: ${question.text}`);
      continue;
    }
    const record: Record<string, unknown> = {
      [Q.name]: question.text.slice(0, 100),
      [Q.text]: question.text,
      [Q.weight]: question.weight,
      [Q.sequence]: question.sequence,
      [Q.answerType]: 'score',
      [Q.isActive]: true,
    };
    const categoryId = categoryIds.get(question.category);
    if (categoryId) Object.assign(record, await dv.lookupBind(Q.categoryBind, 'cr714_categories', categoryId));
    await dv.create('questions', record);
    console.log(`Question created: ${question.text}`);
  }
}

if (require.main === module) {
  seedReferenceData()
    .then(() => {
      console.log('Dataverse reference data seeded.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seed failed:', error?.response?.data ?? error);
      process.exit(1);
    });
}
