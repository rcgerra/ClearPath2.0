import { FunctionEntity, FunctionInput, FunctionRepository as FunctionRepositoryContract } from '../interfaces';
import { SqlCrudRepository } from './SqlCrudRepository';

export class FunctionRepository
  extends SqlCrudRepository<FunctionEntity, FunctionInput>
  implements FunctionRepositoryContract
{
  public constructor() {
    super('Functions', 'FunctionId', [
      { input: 'LegacyDataverseId', column: 'LegacyDataverseId' },
      { input: 'Abbreviation', column: 'Abbreviation' },
      { input: 'Name', column: 'Name' },
    ]);
  }
}

export const functionRepository = new FunctionRepository();
