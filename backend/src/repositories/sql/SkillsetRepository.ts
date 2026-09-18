import { Skillset, SkillsetInput, SkillsetRepository as SkillsetRepositoryContract } from '../interfaces';
import { SqlCrudRepository } from './SqlCrudRepository';

export class SkillsetRepository
  extends SqlCrudRepository<Skillset, SkillsetInput>
  implements SkillsetRepositoryContract
{
  public constructor() {
    super('Skillsets', 'SkillsetId', [
      { input: 'LegacyDataverseId', column: 'LegacyDataverseId' },
      { input: 'Name', column: 'Name' },
      { input: 'Description', column: 'Description' },
    ]);
  }
}

export const skillsetRepository = new SkillsetRepository();
