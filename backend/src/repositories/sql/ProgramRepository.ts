import { Program, ProgramInput, ProgramRepository as ProgramRepositoryContract } from '../interfaces';
import { SqlCrudRepository } from './SqlCrudRepository';

export class ProgramRepository
  extends SqlCrudRepository<Program, ProgramInput>
  implements ProgramRepositoryContract
{
  public constructor() {
    super('Programs', 'ProgramId', [
      { input: 'LegacyDataverseId', column: 'LegacyDataverseId' },
      { input: 'Abbreviation', column: 'Abbreviation' },
      { input: 'Name', column: 'Name' },
      { input: 'LongName', column: 'LongName' },
      { input: 'Purpose', column: 'Purpose' },
      { input: 'Subprogram', column: 'Subprogram' },
    ]);
  }
}

export const programRepository = new ProgramRepository();
