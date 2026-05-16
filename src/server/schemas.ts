import { z } from "zod";

const url = z.string().url();

export const CreateDeveloperSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

export const CreateStoreSchema = z.object({
  name: z.string().min(1),
  withdrawAddress: z.string().min(20),
  webhookUrl: url.optional(),
});

export const CreateCheckoutSchema = z.object({
  amountAtomic: z.string().regex(/^[1-9]\d*$/),
  cancelUrl: url.optional(),
  idempotencyKey: z.string().min(1).max(128).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  storeId: z.string().min(1),
  successUrl: url.optional(),
});
