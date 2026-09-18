import { ScoringCategory, ScoringCategoryInput, ScoringCategoryRepository } from '../interfaces';
import { SqlCrudRepository } from './SqlCrudRepository';

export class CategoryRepository
  extends SqlCrudRepository<ScoringCategory, ScoringCategoryInput>
  implements ScoringCategoryRepository
{
  public constructor() {
    super('ScoringCategories', 'CategoryId', [
      { input: 'LegacyDataverseId', column: 'LegacyDataverseId' },
      { input: 'Name', column: 'Name' },
      { input: 'CategoryType', column: 'CategoryType' },
      { input: 'CategoryWeight', column: 'CategoryWeight' },
      { input: 'Notes', column: 'Notes' },
    ]);
  }
}

export const categoryRepository = new CategoryRepository();
