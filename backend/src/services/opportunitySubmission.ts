import { z } from 'zod';

export const opportunitySubmissionSchema = z.object({
  shortTitle: z.string().trim().min(3).max(100),
  neededBy: z.string().trim().min(1),
  neededByJustification: z.string().trim().min(1).max(4000),
  location: z.string().trim().min(1).max(200),
  sponsorPersonId: z.string().trim().min(1),
  currentState: z.string().trim().min(10).max(4000),
  discoveryMethod: z.string().trim().min(1).max(4000),
  impactToOperations: z.string().trim().min(1).max(4000),
  desiredFutureState: z.string().trim().min(1).max(4000),
});