import { Router } from 'express';
import { z } from 'zod';
import * as dv from '../dataverse/client';
import { COLUMNS, formatted } from '../dataverse/fields';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { combineParentScores, getPrioritizationModel, updatePrioritizationModel } from '../services/prioritizationModel';

const router = Router();
const Q = COLUMNS.questions;
const A = COLUMNS.answers;
const R = COLUMNS.requests;
const C = COLUMNS.categories;

const SCORE_VALUES = [0, 1, 5, 10, 15] as const;
const SCORE_LABELS: Record<number, string> = {
  0: 'No impact',
  1: 'Low impact',
  5: 'Moderate impact',
  10: 'High impact',
  15: 'Critical impact',
};

function parentName(categoryType: unknown): 'Impact' | 'Complexity' {
  return String(categoryType ?? '').toLowerCase() === 'complexity' ? 'Complexity' : 'Impact';
}

function quartileFor(rank: number, total: number): string {
  if (!total) return 'Unranked';
  const quartile = Math.min(4, Math.ceil((rank / total) * 4));
  return ['Highest quartile', 'Upper-middle quartile', 'Lower-middle quartile', 'Lowest quartile'][quartile - 1];
}

function calculateBreakdown(
  requestId: string,
  answers: Array<Record<string, unknown>>,
  questions: Array<Record<string, unknown>>,
  categories: Array<Record<string, unknown>>,
) {
  const requestAnswers = answers.filter((answer) => String(answer[A.requestId]).toLowerCase() === requestId.toLowerCase());
  const categoryScores = categories.map((category) => {
    const categoryId = String(category[C.id]).toLowerCase();
    const categoryQuestions = questions.filter((question) => String(question[Q.categoryId]).toLowerCase() === categoryId);
    const questionWeight = categoryQuestions.reduce((total, question) => total + Number(question[Q.weight] ?? 1), 0);
    const weighted = categoryQuestions.reduce((total, question) => {
      const answer = requestAnswers.find((item) => String(item[A.questionId]).toLowerCase() === String(question[Q.id]).toLowerCase());
      return total + Number(answer?.[A.score] ?? 0) * Number(question[Q.weight] ?? 1);
    }, 0);
    return { parent: parentName(category[C.type]), score: questionWeight ? weighted / questionWeight : 0, weight: Number(category[C.weight] ?? 1) };
  });
  const parentScore = (parent: 'Impact' | 'Complexity') => {
    const rows = categoryScores.filter((category) => category.parent === parent);
    const weight = rows.reduce((total, category) => total + category.weight, 0);
    return weight ? rows.reduce((total, category) => total + category.score * category.weight, 0) / weight : 0;
  };
  const impactScore = parentScore('Impact');
  const complexityScore = parentScore('Complexity');
  return { impactScore, complexityScore, priorityScore: Math.round(combineParentScores(impactScore, complexityScore) * 100) / 100 };
}

const answerSchema = z.object({
  questionId: z.string().uuid(),
  score: z.union([z.literal(0), z.literal(1), z.literal(5), z.literal(10), z.literal(15)]),
  justification: z.string().trim().max(4000).optional().default(''),
  methodology: z.string().trim().max(4000).optional(),
});

const submitSchema = z.object({
  requestId: z.string().uuid(),
  answers: z.array(answerSchema).min(1).max(200),
});

router.use(authenticate);

router.get('/model', asyncHandler(async (_req, res) => {
  res.json(getPrioritizationModel());
}));

router.patch('/model', requireRole('admin'), asyncHandler(async (req, res) => {
  const input = z.object({
    impactWeight: z.number().min(0).max(1),
    complexityWeight: z.number().min(0).max(1),
  }).parse(req.body);
  if (input.impactWeight + input.complexityWeight <= 0) {
    res.status(400).json({ error: 'At least one parent dimension must have a weight greater than zero.' });
    return;
  }
  res.json(updatePrioritizationModel({ Impact: input.impactWeight, Complexity: input.complexityWeight }));
}));

router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const records = await dv.list('categories', {
      select: [C.id, C.name, C.weight, C.type, C.isActive, C.notes],
      orderBy: `${C.name} asc`,
      top: 100,
    });
    res.json(
      records.map((record) => ({
        id: record[C.id],
        name: record[C.name],
        weight: Number(record[C.weight] ?? 1),
        parent: parentName(record[C.type]),
        categoryType: record[C.type],
        notes: record[C.notes],
        isActive: record[C.isActive] !== false,
      })),
    );
  }),
);

router.post(
  '/categories',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const input = z.object({
      name: z.string().trim().min(2).max(200),
      parent: z.enum(['Impact', 'Complexity']),
      weight: z.number().min(0).max(1),
      notes: z.string().max(2000).optional(),
    }).parse(req.body);
    const id = await dv.create('categories', {
      [C.name]: input.name,
      [C.type]: input.parent,
      [C.weight]: input.weight,
      [C.isActive]: true,
      [C.notes]: input.notes ?? '',
    });
    res.status(201).json({ id });
  }),
);

router.patch(
  '/categories/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const input = z.object({
      name: z.string().trim().min(2).max(200).optional(),
      parent: z.enum(['Impact', 'Complexity']).optional(),
      weight: z.number().min(0).max(1).optional(),
      notes: z.string().max(2000).optional(),
      isActive: z.boolean().optional(),
    }).parse(req.body);
    await dv.update('categories', req.params.id, {
      ...(input.name !== undefined ? { [C.name]: input.name } : {}),
      ...(input.parent !== undefined ? { [C.type]: input.parent } : {}),
      ...(input.weight !== undefined ? { [C.weight]: input.weight } : {}),
      ...(input.notes !== undefined ? { [C.notes]: input.notes } : {}),
      ...(input.isActive !== undefined ? { [C.isActive]: input.isActive } : {}),
    });
    res.json({ id: req.params.id });
  }),
);

/** Active questionnaire, ordered by sequence. */
router.get(
  '/questions',
  asyncHandler(async (req, res) => {
    const filters = req.query.includeInactive === 'true' ? [] : [`${Q.isActive} eq true`];
    if (req.query.categoryId) filters.push(`${Q.categoryId} eq ${dv.encodeGuid(String(req.query.categoryId))}`);
    const records = await dv.list('questions', {
      select: [Q.id, Q.name, Q.text, Q.categoryId, Q.weight, Q.sequence, Q.answerType, Q.isActive, Q.required,
        Q.metric, Q.helpText, Q.subtitle, Q.label0, Q.label1, Q.label5, Q.label10, Q.label15],
      filter: filters.join(' and '),
      orderBy: `${Q.sequence} asc`,
      top: 500,
    });
    res.json(
      records.map((r) => ({
        id: r[Q.id],
        name: r[Q.name],
        text: r[Q.text] ?? r[Q.name],
        categoryId: r[Q.categoryId],
        categoryName: formatted(r as Record<string, unknown>, Q.categoryId),
        weight: Number(r[Q.weight] ?? 1),
        sequence: r[Q.sequence],
        answerType: formatted(r as Record<string, unknown>, Q.answerType) ?? r[Q.answerType] ?? 'score',
        isActive: r[Q.isActive] !== false,
        required: r[Q.required] !== false,
        metric: r[Q.metric],
        helpText: r[Q.helpText],
        subtitle: r[Q.subtitle],
        options: SCORE_VALUES.map((score) => ({
          score,
          label: SCORE_LABELS[score],
          text: r[Q[`label${score}` as keyof typeof Q]] ?? '',
        })),
      })),
    );
  }),
);

router.post(
  '/questions',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        text: z.string().min(3).max(2000),
        categoryId: z.string().uuid().optional(),
        weight: z.number().min(0).max(100).default(1),
        sequence: z.number().int().min(0).max(1000).default(0),
        answerType: z.string().max(50).default('score'),
        required: z.boolean().default(true),
        metric: z.string().max(200).optional(),
        helpText: z.string().max(2000).optional(),
        subtitle: z.string().max(1000).optional(),
        options: z.object({
          0: z.string().min(1).max(2000), 1: z.string().min(1).max(2000), 5: z.string().min(1).max(2000),
          10: z.string().min(1).max(2000), 15: z.string().min(1).max(2000),
        }),
      })
      .parse(req.body);

    const record: Record<string, unknown> = {
      [Q.name]: input.text.slice(0, 100),
      [Q.text]: input.text,
      [Q.weight]: input.weight,
      [Q.sequence]: input.sequence,
      [Q.answerType]: input.answerType,
      [Q.isActive]: true,
      [Q.required]: input.required,
      [Q.metric]: input.metric ?? '',
      [Q.helpText]: input.helpText ?? '',
      [Q.subtitle]: input.subtitle ?? '',
      [Q.label0]: input.options[0],
      [Q.label1]: input.options[1],
      [Q.label5]: input.options[5],
      [Q.label10]: input.options[10],
      [Q.label15]: input.options[15],
    };
    if (input.categoryId) Object.assign(record, await dv.lookupBind(Q.categoryBind, 'cr714_categories', input.categoryId));
    res.status(201).json({ id: await dv.create('questions', record) });
  }),
);

router.patch(
  '/questions/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const input = z.object({
      text: z.string().min(3).max(2000).optional(), categoryId: z.string().uuid().optional(),
      weight: z.number().min(0).max(100).optional(), sequence: z.number().int().min(0).max(1000).optional(),
      required: z.boolean().optional(), isActive: z.boolean().optional(), metric: z.string().max(200).optional(),
      helpText: z.string().max(2000).optional(), subtitle: z.string().max(1000).optional(),
      options: z.object({ 0: z.string(), 1: z.string(), 5: z.string(), 10: z.string(), 15: z.string() }).optional(),
    }).parse(req.body);
    const record: Record<string, unknown> = {
      ...(input.text !== undefined ? { [Q.name]: input.text.slice(0, 100), [Q.text]: input.text } : {}),
      ...(input.weight !== undefined ? { [Q.weight]: input.weight } : {}),
      ...(input.sequence !== undefined ? { [Q.sequence]: input.sequence } : {}),
      ...(input.required !== undefined ? { [Q.required]: input.required } : {}),
      ...(input.isActive !== undefined ? { [Q.isActive]: input.isActive } : {}),
      ...(input.metric !== undefined ? { [Q.metric]: input.metric } : {}),
      ...(input.helpText !== undefined ? { [Q.helpText]: input.helpText } : {}),
      ...(input.subtitle !== undefined ? { [Q.subtitle]: input.subtitle } : {}),
    };
    if (input.options) Object.assign(record, {
      [Q.label0]: input.options[0], [Q.label1]: input.options[1], [Q.label5]: input.options[5],
      [Q.label10]: input.options[10], [Q.label15]: input.options[15],
    });
    if (input.categoryId) Object.assign(record, await dv.lookupBind(Q.categoryBind, 'cr714_categories', input.categoryId));
    await dv.update('questions', req.params.id, record);
    res.json({ id: req.params.id });
  }),
);

router.get(
  '/requests',
  asyncHandler(async (req, res) => {
    const isAdmin = req.user?.roles.includes('admin');
    if (!isAdmin && !req.user?.personId) {
      res.json([]);
      return;
    }
    const records = await dv.list('requests', {
      select: [R.id, R.title, R.name, R.shortTitle, R.sponsorPersonId, R.priorityScore],
      filter: isAdmin ? undefined : `${R.sponsorPersonId} eq ${dv.encodeGuid(req.user!.personId!)}`,
      orderBy: `${R.title} asc`, top: 500,
    });
    const [questions, answers] = await Promise.all([
      dv.list('questions', { select: [Q.id], filter: `${Q.isActive} eq true`, top: 500, includeFormattedValues: false }),
      dv.list('answers', { select: [A.requestId, A.questionId, A.score, A.comment], top: 5000, includeFormattedValues: false }),
    ]);
    res.json(records.map((record) => {
      const requestId = String(record[R.id]);
      const requestAnswers = answers.filter((answer) => String(answer[A.requestId]).toLowerCase() === requestId.toLowerCase());
      const prioritizationComplete = questions.length > 0 && questions.every((question) => requestAnswers.some((answer) =>
        String(answer[A.questionId]).toLowerCase() === String(question[Q.id]).toLowerCase()
        && answer[A.score] !== undefined && String(answer[A.comment] ?? '').trim().length > 0,
      ));
      return {
      id: record[R.id], title: record[R.title] ?? record[R.name], shortTitle: record[R.shortTitle],
      sponsorPersonId: record[R.sponsorPersonId], sponsorName: formatted(record as Record<string, unknown>, R.sponsorPersonId),
      ...(isAdmin ? { priorityScore: record[R.priorityScore] } : {}), prioritizationComplete,
      };
    }));
  }),
);

router.get(
  '/requests/:requestId/answers',
  asyncHandler(async (req, res) => {
    const records = await dv.list('answers', {
      select: [A.id, A.questionId, A.requestId, A.value, A.score, A.comment, A.methodology],
      filter: `${A.requestId} eq ${dv.encodeGuid(req.params.requestId)}`,
      top: 500,
    });
    res.json(
      records.map((r) => ({
        id: r[A.id],
        questionId: r[A.questionId],
        questionText: formatted(r as Record<string, unknown>, A.questionId),
        requestId: r[A.requestId],
        value: r[A.value],
        score: r[A.score],
        comment: r[A.comment],
        justification: r[A.comment],
        methodology: r[A.methodology],
      })),
    );
  }),
);

/** Stores questionnaire answers and writes the weighted priority score back to the request. */
router.post(
  '/submit',
  asyncHandler(async (req, res) => {
    const input = submitSchema.parse(req.body);
    const request = await dv.retrieve('requests', input.requestId, { select: [R.sponsorPersonId] });
    if (!req.user?.roles.includes('admin') && String(request[R.sponsorPersonId]).toLowerCase() !== req.user?.personId?.toLowerCase()) {
      res.status(403).json({ error: 'Only the assigned sponsor can prioritize this request.' });
      return;
    }

    const questions = await dv.list('questions', {
      select: [Q.id, Q.weight, Q.categoryId, Q.required],
      filter: `${Q.isActive} eq true`,
      top: 500,
      includeFormattedValues: false,
    });
    if (input.answers.length !== questions.length) {
      res.status(400).json({ error: 'Every active prioritization question requires an answer and justification.' });
      return;
    }
    const categories = await dv.list('categories', {
      select: [C.id, C.name, C.weight, C.type], top: 100, includeFormattedValues: false,
    });
    const categoryById = new Map(categories.map((category) => [String(category[C.id]).toLowerCase(), category]));
    const questionById = new Map(questions.map((question) => [String(question[Q.id]).toLowerCase(), question]));

    const existing = await dv.list('answers', {
      select: [A.id, A.questionId],
      filter: `${A.requestId} eq ${dv.encodeGuid(input.requestId)}`,
      top: 500,
      includeFormattedValues: false,
    });
    const existingByQuestion = new Map(existing.map((a) => [String(a[A.questionId]).toLowerCase(), String(a[A.id])]));

    const categoryTotals = new Map<string, { parent: 'Impact' | 'Complexity'; weighted: number; questionWeight: number; categoryWeight: number }>();

    for (const answer of input.answers) {
      const question = questionById.get(answer.questionId.toLowerCase());
      if (!question) {
        res.status(400).json({ error: 'An answer references an inactive or unknown question.' });
        return;
      }
      if (question[Q.required] !== false && answer.score === 0) {
        res.status(400).json({ error: 'Required questions must have an impact rating.' });
        return;
      }
      if (answer.score !== 0 && !answer.justification.trim()) {
        res.status(400).json({ error: 'Every rated question requires a justification.' });
        return;
      }
      const questionWeight = Number(question[Q.weight] ?? 1);
      const categoryId = String(question[Q.categoryId] ?? '').toLowerCase();
      const category = categoryById.get(categoryId);
      const current = categoryTotals.get(categoryId) ?? {
        parent: parentName(category?.[C.type]), weighted: 0, questionWeight: 0,
        categoryWeight: Number(category?.[C.weight] ?? 1),
      };
      current.weighted += answer.score * questionWeight;
      current.questionWeight += questionWeight;
      categoryTotals.set(categoryId, current);

      const record: Record<string, unknown> = {
        [A.value]: SCORE_LABELS[answer.score],
        [A.score]: answer.score,
        [A.comment]: answer.justification,
        [A.methodology]: answer.methodology ?? '',
      };

      const existingId = existingByQuestion.get(answer.questionId.toLowerCase());
      if (existingId) {
        await dv.update('answers', existingId, record);
      } else {
        Object.assign(record, await dv.lookupBind(A.questionBind, 'cr714_questions', answer.questionId));
        Object.assign(record, await dv.lookupBind(A.requestBind, 'cr714_requests', input.requestId));
        record[A.name] = `Answer ${answer.questionId.slice(0, 8)}`;
        await dv.create('answers', record);
      }
    }

    const parentTotals = new Map<string, { weighted: number; weight: number }>();
    for (const category of categoryTotals.values()) {
      const categoryScore = category.questionWeight ? category.weighted / category.questionWeight : 0;
      const total = parentTotals.get(category.parent) ?? { weighted: 0, weight: 0 };
      total.weighted += categoryScore * category.categoryWeight;
      total.weight += category.categoryWeight;
      parentTotals.set(category.parent, total);
    }
    const impactScore = parentTotals.get('Impact')?.weight
      ? parentTotals.get('Impact')!.weighted / parentTotals.get('Impact')!.weight : 0;
    const complexityScore = parentTotals.get('Complexity')?.weight
      ? parentTotals.get('Complexity')!.weighted / parentTotals.get('Complexity')!.weight : 0;
    const priorityScore = Math.round(combineParentScores(impactScore, complexityScore) * 100) / 100;
    await dv.update('requests', input.requestId, { [R.priorityScore]: priorityScore });
    const ranked = await dv.list('requests', { select: [R.id, R.priorityScore], orderBy: `${R.priorityScore} desc`, top: 500 });
    const rank = ranked.findIndex((record) => String(record[R.id]).toLowerCase() === input.requestId.toLowerCase()) + 1;
    res.json({ requestId: input.requestId, quartile: quartileFor(rank, ranked.length), topTen: rank > 0 && rank <= 10 });
  }),
);

/** Ranked backlog by weighted questionnaire score. */
router.get(
  '/ranking',
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    const [records, answers, questions, categories] = await Promise.all([dv.list('requests', {
      select: [R.id, R.title, R.name, R.status, R.priorityScore, R.departmentId, R.categoryId],
      filter: `${R.isActive} eq 0`,
      orderBy: `${R.priorityScore} desc`,
      top: 500,
    }), dv.list('answers', { select: [A.requestId, A.questionId, A.score], top: 5000, includeFormattedValues: false }),
    dv.list('questions', { select: [Q.id, Q.categoryId, Q.weight], top: 500, includeFormattedValues: false }),
    dv.list('categories', { select: [C.id, C.type, C.weight], top: 100, includeFormattedValues: false })]);
    res.json(
      records.map((r, index) => ({
        ...calculateBreakdown(String(r[R.id]), answers, questions, categories),
        rank: index + 1,
        id: r[R.id],
        title: r[R.title] ?? r[R.name],
        status: formatted(r as Record<string, unknown>, R.status) ?? r[R.status],
        priorityScore: r[R.priorityScore],
        departmentName: formatted(r as Record<string, unknown>, R.departmentId),
        categoryName: formatted(r as Record<string, unknown>, R.categoryId),
      })),
    );
  }),
);

export default router;
