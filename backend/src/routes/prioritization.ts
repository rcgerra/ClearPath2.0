import { Router } from 'express';
import { z } from 'zod';
import * as dv from '../dataverse/client';
import { COLUMNS, formatted } from '../dataverse/fields';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();
const Q = COLUMNS.questions;
const A = COLUMNS.answers;
const CAT = COLUMNS.categories;
const R = COLUMNS.requests;

const answerSchema = z.object({
  questionId: z.string().uuid(),
  value: z.union([z.string().max(2000), z.number()]),
  score: z.number().min(0).max(100).optional(),
  comment: z.string().max(2000).optional(),
});

const submitSchema = z.object({
  requestId: z.string().uuid(),
  answers: z.array(answerSchema).min(1).max(200),
});

router.use(authenticate);

router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const records = await dv.list('categories', {
      select: [CAT.id, CAT.name, CAT.weight],
      orderBy: `${CAT.name} asc`,
      top: 500,
    });
    res.json(records.map((r) => ({ id: r[CAT.id], name: r[CAT.name], weight: r[CAT.weight] })));
  }),
);

/** Active questionnaire, ordered by sequence. */
router.get(
  '/questions',
  asyncHandler(async (req, res) => {
    const filters = [`${Q.isActive} eq true`];
    if (req.query.categoryId) filters.push(`${Q.categoryId} eq ${dv.encodeGuid(String(req.query.categoryId))}`);
    const records = await dv.list('questions', {
      select: [Q.id, Q.name, Q.text, Q.categoryId, Q.weight, Q.sequence, Q.answerType],
      filter: filters.join(' and '),
      orderBy: `${Q.sequence} asc`,
      top: 500,
    });
    res.json(
      records.map((r) => ({
        id: r[Q.id],
        name: r[Q.name],
        text: r[Q.text],
        categoryId: r[Q.categoryId],
        categoryName: formatted(r as Record<string, unknown>, Q.categoryId),
        weight: Number(r[Q.weight] ?? 1),
        sequence: r[Q.sequence],
        answerType: formatted(r as Record<string, unknown>, Q.answerType) ?? r[Q.answerType] ?? 'score',
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
      })
      .parse(req.body);

    const record: Record<string, unknown> = {
      [Q.name]: input.text.slice(0, 100),
      [Q.text]: input.text,
      [Q.weight]: input.weight,
      [Q.sequence]: input.sequence,
      [Q.answerType]: input.answerType,
      [Q.isActive]: true,
    };
    if (input.categoryId) Object.assign(record, await dv.lookupBind(Q.categoryBind, 'cr714_categories', input.categoryId));
    res.status(201).json({ id: await dv.create('questions', record) });
  }),
);

router.get(
  '/requests/:requestId/answers',
  asyncHandler(async (req, res) => {
    const records = await dv.list('answers', {
      select: [A.id, A.questionId, A.requestId, A.value, A.score, A.comment],
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
      })),
    );
  }),
);

/** Stores questionnaire answers and writes the weighted priority score back to the request. */
router.post(
  '/submit',
  asyncHandler(async (req, res) => {
    const input = submitSchema.parse(req.body);

    const questions = await dv.list('questions', {
      select: [Q.id, Q.weight],
      filter: `${Q.isActive} eq true`,
      top: 500,
      includeFormattedValues: false,
    });
    const weightByQuestion = new Map(
      questions.map((q) => [String(q[Q.id]).toLowerCase(), Number(q[Q.weight] ?? 1)]),
    );

    const existing = await dv.list('answers', {
      select: [A.id, A.questionId],
      filter: `${A.requestId} eq ${dv.encodeGuid(input.requestId)}`,
      top: 500,
      includeFormattedValues: false,
    });
    const existingByQuestion = new Map(existing.map((a) => [String(a[A.questionId]).toLowerCase(), String(a[A.id])]));

    let weightedTotal = 0;
    let weightSum = 0;

    for (const answer of input.answers) {
      const weight = weightByQuestion.get(answer.questionId.toLowerCase()) ?? 1;
      const score = answer.score ?? (typeof answer.value === 'number' ? answer.value : 0);
      weightedTotal += score * weight;
      weightSum += weight;

      const record: Record<string, unknown> = {
        [A.value]: String(answer.value),
        [A.score]: score,
      };
      if (answer.comment !== undefined) record[A.comment] = answer.comment;

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

    const priorityScore = weightSum > 0 ? Math.round((weightedTotal / weightSum) * 100) / 100 : 0;
    await dv.update('requests', input.requestId, { [R.priorityScore]: priorityScore });

    res.json({ requestId: input.requestId, priorityScore });
  }),
);

/** Ranked backlog by weighted questionnaire score. */
router.get(
  '/ranking',
  asyncHandler(async (_req, res) => {
    const records = await dv.list('requests', {
      select: [R.id, R.title, R.name, R.status, R.priorityScore, R.departmentId, R.categoryId],
      orderBy: `${R.priorityScore} desc`,
      top: 500,
    });
    res.json(
      records.map((r, index) => ({
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
