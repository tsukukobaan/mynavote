import { z } from "zod";

export const voteRequestSchema = z.object({
  electionId: z.string().min(1).max(30),
  encryptedVote: z
    .string()
    .min(1)
    .max(10000)
    .regex(/^[A-Za-z0-9+/=_-]+$/),
  ballotTracker: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9+/=_-]+$/),
  csrfToken: z.string().length(64),
});

export const createElectionSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  description: z.string().max(2000).optional(),
  districtId: z.string().max(20).optional(),
  votingStartAt: z.string().datetime(),
  votingEndAt: z.string().datetime(),
  allowRevote: z.boolean(),
  candidates: z
    .array(
      z.object({
        name: z.string().min(1).max(100).trim(),
        profile: z.string().max(2000).optional(),
      })
    )
    .min(2),
});

export const countElectionSchema = z.object({
  secretKey: z.string().min(1).max(500),
  csrfToken: z.string().length(64).optional(),
});
