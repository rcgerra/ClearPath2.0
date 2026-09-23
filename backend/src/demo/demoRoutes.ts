import { Router } from 'express';
import { env } from '../config/env';
import { signToken } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { CsvDataService } from './csvData';

/**
 * In-memory sample data used only when DEMO_MODE=true, so the UI can be reviewed
 * without Dataverse credentials. Never mounted when DEMO_MODE is off.
 */
/** Table prefixes mapped to hex so generated ids are valid GUIDs. */
const HEX_PREFIX: Record<string, string> = { d: 'd', p: 'a', f: 'f', j: 'b', r: 'c', c: 'e', u: '9' };

const id = (n: number, prefix: string) =>
  `${HEX_PREFIX[prefix] ?? 'a'}${String(n).padStart(7, '0')}-0000-4000-8000-000000000000`.slice(0, 36);
const dataService = env.demoMode ? new CsvDataService() : CsvDataService.empty();

const router = Router();

function patch(collection: Parameters<CsvDataService['update']>[0], recordId: string, body: Record<string, unknown>) {
  const record = dataService.update(collection, recordId, body);
  if (!record) throw new HttpError(404, 'Record not found.');
  return record;
}

router.get('/auth/users', (req, res) => {
  const search = req.query.search ? String(req.query.search).toLowerCase() : '';
  const users = dataService.listUsers()
    .filter((user) => !search || user.DisplayName.toLowerCase().includes(search) || user.Email.toLowerCase().includes(search))
    .slice(0, 200);
  res.json(users.map((user) => ({
    id: user.UserId,
    personId: user.UserId,
    fullName: user.DisplayName,
    email: user.Email,
    jobTitle: dataService.find('people', user.UserId)?.title,
  })));
});

/** Mirrors the real session endpoint using the selected CSV-backed user. */
router.get('/auth/session', (req, res) => {
  const selectedUser = dataService.findUser(String(req.query.userId ?? ''));
  const person = selectedUser ? dataService.find('people', selectedUser.UserId) : undefined;
  if (!selectedUser || !selectedUser.Active || !person) throw new HttpError(403, 'Select an active user.');
  const user = {
    userId: selectedUser.UserId,
    personId: person.id,
    email: selectedUser.Email,
    name: selectedUser.DisplayName,
    roles: ['admin', 'portfolio_manager', 'user'] as const,
    departmentId: person.departmentId,
  };
  res.json({ token: signToken({ ...user, roles: [...user.roles] }), user });
});

router.get('/departments', (_req, res) => res.json(dataService.list('departments')));
router.get('/departments/:id', asyncHandler(async (req, res) => {
  const record = dataService.find('departments', req.params.id);
  if (!record) throw new HttpError(404, 'Department not found.');
  res.json(record);
}));
router.post('/departments', (req, res) => {
  const departments = dataService.list('departments');
  const record = { id: id(departments.length + 1, 'd'), isActive: true, ...req.body } as (typeof departments)[number];
  dataService.create('departments', record);
  res.status(201).json({ id: record.id });
});
router.patch('/departments/:id', asyncHandler(async (req, res) => {
  res.json(patch('departments', req.params.id, req.body));
}));

router.get('/people', (req, res) => {
  const departmentId = req.query.departmentId ? String(req.query.departmentId) : undefined;
  const functionId = req.query.functionId ? String(req.query.functionId) : undefined;
  const search = req.query.search ? String(req.query.search).toLowerCase() : undefined;
  const active = req.query.active !== undefined ? req.query.active === 'true' : undefined;
  let rows = dataService.list('people');
  if (departmentId) rows = rows.filter((row) => row.departmentId === departmentId);
  if (functionId) rows = rows.filter((row) => row.functionId === functionId);
  if (search) rows = rows.filter((row) => row.name.toLowerCase().includes(search) || row.email.toLowerCase().includes(search));
  if (active !== undefined) rows = rows.filter((row) => row.isActive === active);
  res.json(rows);
});
router.get('/people/:id', asyncHandler(async (req, res) => {
  const record = dataService.find('people', req.params.id);
  if (!record) throw new HttpError(404, 'Person not found.');
  res.json(record);
}));
router.post('/people', (req, res) => {
  const people = dataService.list('people');
  const record = { id: id(people.length + 1, 'p'), isActive: true, ...req.body } as (typeof people)[number];
  dataService.create('people', record);
  res.status(201).json({ id: record.id });
});
router.patch('/people/:id', asyncHandler(async (req, res) => {
  res.json(patch('people', req.params.id, req.body));
}));

router.get('/projects', (_req, res) => res.json(dataService.list('projects')));
router.get('/projects/:id', asyncHandler(async (req, res) => {
  const record = dataService.find('projects', req.params.id);
  if (!record) throw new HttpError(404, 'Project not found.');
  res.json(record);
}));
router.get('/projects/:id/team', (req, res) => res.json(dataService.filterBy('demand', (row) => row.projectId === req.params.id)));
router.post('/projects', (req, res) => {
  const projects = dataService.list('projects');
  const record = { id: id(projects.length + 1, 'j'), ...req.body } as (typeof projects)[number];
  dataService.create('projects', record);
  res.status(201).json({ id: record.id });
});
router.patch('/projects/:id', asyncHandler(async (req, res) => {
  res.json(patch('projects', req.params.id, req.body));
}));

router.get('/requests', (req, res) => {
  const requests = dataService.list('requests');
  if (req.query.mine !== 'true') {
    res.json(requests);
    return;
  }
  const me = demoPerson().id;
  res.json(dataService.filterBy('requests', (row) => row.requesterPersonId === me || row.delegatePersonId === me));
});
router.get('/requests/:id', asyncHandler(async (req, res) => {
  const record = dataService.find('requests', req.params.id);
  if (!record) throw new HttpError(404, 'Request not found.');
  res.json(record);
}));
router.patch('/requests/:id', asyncHandler(async (req, res) => {
  res.json(patch('requests', req.params.id, req.body));
}));

router.get('/lookups/functions', (_req, res) => res.json(dataService.list('functions')));

const demoPerson = () => dataService.findPersonByEmail(env.devUserEmail);

router.get('/capacity', (req, res) => {
  const personId = req.query.mine === 'true' ? demoPerson().id : req.query.personId ? String(req.query.personId) : undefined;
  const departmentId = req.query.departmentId ? String(req.query.departmentId) : undefined;
  let rows = dataService.listCapacity();
  if (personId) rows = rows.filter((row) => row.personId === personId);
  if (departmentId) rows = rows.filter((row) => row.departmentId === departmentId);
  res.json(rows);
});

router.get('/capacity/person/:personId/net', (req, res) => {  const availability = dataService.listCapacity().filter((row) => row.personId === req.params.personId)
    .reduce<number[]>((total, row) => row.weeks.map((value, i) => (total[i] ?? 0) + value), new Array(1333).fill(0));
  const committed = dataService.listDemand().filter((row) => row.personId === req.params.personId)
    .reduce<number[]>((total, row) => row.weeks.map((value, i) => (total[i] ?? 0) + value), new Array(1333).fill(0));
  res.json({
    personId: req.params.personId,
    availability,
    demand: committed,
    net: availability.map((value, i) => value - committed[i]),
    overAllocatedWeeks: availability
      .map((value, i) => ({ week: i, over: committed[i] - value }))
      .filter((entry) => entry.over > 0),
  });
});

router.post('/capacity', (req, res) => {
  const person = dataService.find('people', req.body?.personId);
  const capacity = dataService.list('capacity');
  if (person && capacity.some((row) => row.personId === person.id)) {
    res.status(409).json({ error: 'That person already has an availability record.' });
    return;
  }
  const baseline = Number(req.body?.weeklyBaseline ?? person?.weeklyHours ?? 40);
  const weeks = Array.isArray(req.body?.weeks) && req.body.weeks.length
    ? new Array(1333).fill(0).map((_, index) => Number(req.body.weeks[index] ?? 0))
    : new Array(1333).fill(0).map((_, index) => (index < 26 ? baseline : 0));
  const record = {
    id: id(capacity.length + 20, 'e'),
    personId: person?.id ?? '',
    personName: person?.name ?? 'Unassigned',
    departmentId: String(req.body?.departmentId ?? person?.departmentId ?? ''),
    departmentName: person?.departmentName,
    availabilityHours: null,
    weeks,
    weeklyBaseline: baseline,
    notes: '',
  } as (typeof capacity)[number];
  dataService.create('capacity', record);
  res.status(201).json({ id: record.id });
});

router.patch('/capacity/:id/weeks', asyncHandler(async (req, res) => {
  const { week, startWeek, endWeek } = req.body ?? {};
  if (!Number.isFinite(week) && !(Number.isFinite(startWeek) && Number.isFinite(endWeek))) {
    throw new HttpError(400, 'Provide either week or startWeek/endWeek.');
  }
  const record = dataService.updateWeeks('capacity', req.params.id, req.body ?? {});
  if (!record) throw new HttpError(404, 'Availability row not found.');
  res.json({ id: record.id, weeks: record.weeks });
}));

router.patch('/capacity/:id', asyncHandler(async (req, res) => {
  res.json(patch('capacity', req.params.id, req.body));
}));

router.delete('/capacity/:id', (req, res) => {
  dataService.remove('capacity', req.params.id);
  res.status(204).end();
});

router.get('/demand', (req, res) => {
  const personId = req.query.mine === 'true' ? demoPerson().id : String(req.query.personId ?? '');  const projectId = String(req.query.projectId ?? '');
  let rows = dataService.list('demand');
  if (personId) rows = rows.filter((row) => row.personId === personId);
  if (projectId) rows = rows.filter((row) => row.projectId === projectId);
  res.json(rows);
});router.get('/prioritization/categories', (_req, res) => res.json(dataService.list('categories')));
router.get('/users', (req, res) => {
  const search = req.query.search ? String(req.query.search).toLowerCase() : '';
  const people = dataService.list('people')
    .filter((person) => !search || person.name.toLowerCase().includes(search) || person.email.toLowerCase().includes(search));
  res.json(people.map((person) => ({ id: person.id, personId: person.id, fullName: person.name, email: person.email })));
});
router.get('/admin/portfolio-summary', (_req, res) =>
  res.json(dataService.getPortfolioSummary()),
);

router.post('/demand', (req, res) => {
  const person = dataService.find('people', req.body?.personId);
  const project = dataService.find('projects', req.body?.projectId);
  const fn = dataService.find('functions', req.body?.functionId);
  const demand = dataService.list('demand');
  if (person && demand.some((row) => row.projectId === req.body?.projectId && row.personId === person.id)) {
    res.status(409).json({ error: 'That person is already on this project team.' });
    return;
  }
  const weeks = new Array(1333).fill(0);
  const { startWeek, endWeek, hoursPerWeek, weeks: provided } = req.body ?? {};
  if (Array.isArray(provided)) {
    provided.forEach((value: number, index: number) => {
      if (index < weeks.length) weeks[index] = value;
    });
  } else if (Number.isFinite(startWeek) && Number.isFinite(endWeek) && Number.isFinite(hoursPerWeek)) {
    for (let i = startWeek; i <= endWeek && i < weeks.length; i += 1) weeks[i] = hoursPerWeek;
  }
  const record = {
    id: id(demand.length + 10, 'f'),
    projectId: String(req.body?.projectId ?? ''),
    projectName: project?.name ?? 'Project',
    personId: person?.id,
    personName: person?.name ?? 'Unassigned',
    functionId: fn?.id,
    functionName: fn?.name,
    demandHours: null,
    weeks,
    startWeek: 0,
    endWeek: 0,
    status: 'Planned',
  } as (typeof demand)[number];
  dataService.create('demand', record);
  res.status(201).json({ id: record.id });
});

router.patch('/demand/:id/weeks', asyncHandler(async (req, res) => {
  const { week, startWeek, endWeek } = req.body ?? {};
  if (!Number.isFinite(week) && !(Number.isFinite(startWeek) && Number.isFinite(endWeek))) {
    throw new HttpError(400, 'Provide either week or startWeek/endWeek.');
  }
  const record = dataService.updateWeeks('demand', req.params.id, req.body ?? {});
  if (!record) throw new HttpError(404, 'Demand row not found.');
  res.json({ id: record.id, weeks: record.weeks });
}));

router.patch('/demand/:id', asyncHandler(async (req, res) => {
  res.json(patch('demand', req.params.id, req.body));
}));

router.get('/skills/categories', (_req, res) => res.json(dataService.listSkillCategories()));

router.post('/skills/categories', (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) throw new HttpError(400, 'Category name is required.');
  if (dataService.listSkillCategories().some((category) => category.name.toLowerCase() === name.toLowerCase())) {
    throw new HttpError(409, 'That skill category already exists.');
  }
  const category = dataService.createSkillCategory(name);
  res.status(201).json({ id: category.id });
});

router.patch('/skills/categories/:id', (req, res) => {
  const category = dataService.updateSkillCategory(req.params.id, {
    name: typeof req.body?.name === 'string' ? req.body.name.trim() : undefined,
    isActive: typeof req.body?.isActive === 'boolean' ? req.body.isActive : undefined,
  });
  if (!category) throw new HttpError(404, 'Skill category not found.');
  res.json({ id: category.id });
});

router.get('/skills', (req, res) => {
  const categoryId = req.query.categoryId ? String(req.query.categoryId) : undefined;
  res.json(dataService.listSkills(categoryId));
});

/** Any authenticated user can add a new skill to an existing category. */
router.post('/skills', (req, res) => {
  const categoryId = String(req.body?.categoryId ?? '');
  const name = String(req.body?.name ?? '').trim();
  const category = dataService.findSkillCategory(categoryId);
  if (!category?.isActive) throw new HttpError(404, 'Active skill category not found.');
  if (!name) throw new HttpError(400, 'Skill name is required.');
  if (dataService.listSkills(categoryId).some((skill) => skill.name.toLowerCase() === name.toLowerCase())) {
    throw new HttpError(409, 'That skill already exists in this category.');
  }
  const skill = dataService.createSkill(categoryId, name);
  res.status(201).json({ id: skill.id });
});

router.patch('/skills/:id', (req, res) => {
  const skill = dataService.updateSkill(req.params.id, {
    name: typeof req.body?.name === 'string' ? req.body.name.trim() : undefined,
    isActive: typeof req.body?.isActive === 'boolean' ? req.body.isActive : undefined,
  });
  if (!skill) throw new HttpError(404, 'Skill not found.');
  res.json({ id: skill.id });
});

router.get('/skills/people/:personId', (req, res) => res.json(dataService.listPersonSkills(req.params.personId)));

router.post('/skills/people/:personId', (req, res) => {
  const skillId = String(req.body?.skillId ?? '');
  const record = dataService.addPersonSkill(req.params.personId, skillId);
  if (!record) throw new HttpError(404, 'Skill not found.');
  res.status(201).json({ id: record.id });
});

router.delete('/skills/people/:personId/:skillId', (req, res) => {
  dataService.removePersonSkill(req.params.personId, req.params.skillId);
  res.status(204).end();
});

router.get('/non-project-demand/categories', (_req, res) => res.json(dataService.listNonProjectDemandCategories()));

router.post('/non-project-demand/categories', (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) throw new HttpError(400, 'Category name is required.');
  if (dataService.listNonProjectDemandCategories().some((category) => category.name.toLowerCase() === name.toLowerCase())) {
    throw new HttpError(409, 'That non-project demand category already exists.');
  }
  const category = dataService.createNonProjectDemandCategory(name);
  res.status(201).json({ id: category.id });
});

router.patch('/non-project-demand/categories/:id', (req, res) => {
  const category = dataService.updateNonProjectDemandCategory(req.params.id, {
    name: req.body?.name === undefined ? undefined : String(req.body.name).trim(),
    isActive: req.body?.isActive === undefined ? undefined : Boolean(req.body.isActive),
  });
  if (!category) throw new HttpError(404, 'Non-project demand category not found.');
  res.json({ id: category.id });
});

router.get('/non-project-demand/subcategories', (req, res) => {
  const categoryId = req.query.categoryId ? String(req.query.categoryId) : undefined;
  res.json(dataService.listNonProjectDemandSubcategories(categoryId));
});

router.post('/non-project-demand/subcategories', (req, res) => {
  const categoryId = String(req.body?.categoryId ?? '');
  const name = String(req.body?.name ?? '').trim();
  if (!dataService.findNonProjectDemandCategory(categoryId)?.isActive) {
    throw new HttpError(404, 'Active non-project demand category not found.');
  }
  if (dataService.listNonProjectDemandSubcategories(categoryId).some((subcategory) => subcategory.name.toLowerCase() === name.toLowerCase())) {
    throw new HttpError(409, 'That subcategory already exists in this category.');
  }
  const subcategory = dataService.createNonProjectDemandSubcategory(categoryId, name);
  res.status(201).json({ id: subcategory.id });
});

router.patch('/non-project-demand/subcategories/:id', (req, res) => {
  const subcategory = dataService.updateNonProjectDemandSubcategory(req.params.id, {
    name: req.body?.name === undefined ? undefined : String(req.body.name).trim(),
    isActive: req.body?.isActive === undefined ? undefined : Boolean(req.body.isActive),
  });
  if (!subcategory) throw new HttpError(404, 'Non-project demand subcategory not found.');
  res.json({ id: subcategory.id });
});

router.get('/non-project-demand', (req, res) => {
  const personId = req.query.personId ? String(req.query.personId) : undefined;
  const departmentId = req.query.departmentId ? String(req.query.departmentId) : undefined;
  res.json(
    dataService.listNonProjectDemand(personId, departmentId),
  );
});

router.post('/non-project-demand', (req, res) => {
  const subcategory = dataService.findNonProjectDemandSubcategory(String(req.body?.subcategoryId ?? ''));
  const category = subcategory ? dataService.findNonProjectDemandCategory(subcategory.categoryId) : undefined;
  if (!subcategory || !category) throw new HttpError(404, 'Active non-project demand subcategory not found.');
  const description = String(req.body?.description ?? '').trim();
  if (!description) throw new HttpError(400, 'Description is required.');
  const row = {
    id: id(dataService.listNonProjectDemand().length + 30, 'n'),
    categoryId: category.id,
    categoryName: category.name,
    subcategoryId: subcategory.id,
    subcategoryName: subcategory.name,
    personId: String(req.body?.personId ?? ''),
    departmentId: String(req.body?.departmentId ?? ''),
    description,
    weeks: new Array(1333).fill(0),
    isActive: true,
  };
  dataService.createNonProjectDemand(row);
  res.status(201).json({ id: row.id });
});

router.patch('/non-project-demand/:id/weeks', (req, res) => {
  const row = dataService.updateNonProjectDemandWeeks(req.params.id, req.body ?? {});
  if (!row) throw new HttpError(404, 'Non-project demand row not found.');
  res.json({ id: row.id, weeks: row.weeks });
});

router.patch('/non-project-demand/:id', (req, res) => {
  const row = dataService.updateNonProjectDemand(req.params.id, {
    isActive: typeof req.body?.isActive === 'boolean' ? req.body.isActive : undefined,
    description: typeof req.body?.description === 'string' ? req.body.description : undefined,
  });
  if (!row) throw new HttpError(404, 'Non-project demand row not found.');
  res.json({ id: row.id });
});

router.delete('/non-project-demand/:id', (req, res) => {
  dataService.removeNonProjectDemand(req.params.id);
  res.status(204).end();
});

router.delete('/demand/:id', (req, res) => {
  dataService.remove('demand', req.params.id);
  res.status(204).end();
});

export default router;


