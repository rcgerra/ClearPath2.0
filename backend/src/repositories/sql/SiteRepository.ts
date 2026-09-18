import { Site, SiteInput, SiteRepository as SiteRepositoryContract } from '../interfaces';
import { SqlCrudRepository } from './SqlCrudRepository';

export class SiteRepository
  extends SqlCrudRepository<Site, SiteInput>
  implements SiteRepositoryContract
{
  public constructor() {
    super('Sites', 'SiteId', [
      { input: 'LegacyDataverseId', column: 'LegacyDataverseId' },
      { input: 'Abbreviation', column: 'Abbreviation' },
      { input: 'Name', column: 'Name' },
    ]);
  }
}

export const siteRepository = new SiteRepository();
