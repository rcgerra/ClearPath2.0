export interface AuditedEntity {
  CreatedDate: Date;
  ModifiedDate: Date;
  IsActive: boolean;
}

export interface LegacyEntity extends AuditedEntity {
  LegacyDataverseId: string | null;
}

export interface RepositoryListOptions {
  includeInactive?: boolean;
  limit?: number;
  offset?: number;
}

export interface Repository<TEntity, TCreate, TUpdate, TId = number, TCreateResult = TEntity> {
  findById(id: TId): Promise<TEntity | null>;
  create(input: TCreate): Promise<TCreateResult>;
  update(id: TId, input: TUpdate): Promise<boolean>;
  deactivate(id: TId): Promise<boolean>;
}

export interface ListRepository<TEntity, TListArgument = RepositoryListOptions> {
  list(argument?: TListArgument): Promise<TEntity[]>;
}

export type CrudRepository<TEntity, TCreate, TUpdate, TId = number, TCreateResult = TEntity> =
  Repository<TEntity, TCreate, TUpdate, TId, TCreateResult> &
  ListRepository<TEntity>;

export interface AssociationRepository<TEntity, TInput, TKey> {
  list(): Promise<TEntity[]>;
  findById(key: TKey): Promise<TEntity | null>;
  add(input: TInput): Promise<TEntity>;
  remove(key: TKey): Promise<boolean>;
}

export interface LegacyEntityInput {
  LegacyDataverseId?: string | null;
}

export type PartialUpdate<TCreate> = Partial<TCreate>;

export interface WeekValue {
  WeekStartDate: string;
  Hours: number;
}
