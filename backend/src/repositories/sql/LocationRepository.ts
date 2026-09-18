import { Location, LocationInput, LocationRepository as LocationRepositoryContract } from '../interfaces';
import { SqlCrudRepository } from './SqlCrudRepository';

export class LocationRepository
  extends SqlCrudRepository<Location, LocationInput>
  implements LocationRepositoryContract
{
  public constructor() {
    super('Locations', 'LocationId', [
      { input: 'LegacyDataverseId', column: 'LegacyDataverseId' },
      { input: 'Abbreviation', column: 'Abbreviation' },
      { input: 'Name', column: 'Name' },
    ]);
  }
}

export const locationRepository = new LocationRepository();
