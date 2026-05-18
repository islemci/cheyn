import { z } from "zod";

const url = z.string().url();

export const CreateDeveloperSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

export const CreateStoreSchema = z.object({
  cancelCallbackUrl: url.optional(),
  name: z.string().min(1),
  successCallbackUrl: url.optional(),
  withdrawAddress: z.string().min(20),
  webhookUrl: url.optional(),
});

export const UpdateStoreSchema = z
  .object({
    cancelCallbackUrl: url.nullable().optional(),
    name: z.string().min(1).optional(),
    successCallbackUrl: url.nullable().optional(),
    webhookUrl: url.nullable().optional(),
    withdrawAddress: z.string().min(20).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one store field to update",
  });

export const CreateCheckoutSchema = z
  .object({
    amount: z
      .string()
      .regex(/^[1-9]\d*(\.\d{1,2})?$/)
      .optional(),
    amountAtomic: z
      .string()
      .regex(/^[1-9]\d*$/)
      .optional(),
    amountUsdCents: z
      .string()
      .regex(/^[1-9]\d*$/)
      .optional(),
    cancelUrl: url.optional(),
    currency: z.enum(["USD"]).optional(),
    idempotencyKey: z.string().min(1).max(128).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    storeId: z.string().min(1),
    successUrl: url.optional(),
  })
  .refine(
    (value) => {
      const hasAtomic = Boolean(value.amountAtomic);
      const hasUsdCents = Boolean(value.amountUsdCents);
      const hasDisplayAmount = Boolean(value.amount || value.currency);

      return (
        [hasAtomic, hasUsdCents, hasDisplayAmount].filter(Boolean).length === 1
      );
    },
    {
      message:
        "Provide exactly one of amountAtomic, amountUsdCents, or amount with currency",
    },
  )
  .refine((value) => !value.amount || value.currency === "USD", {
    message: "currency must be USD when amount is provided",
  })
  .refine((value) => !value.currency || Boolean(value.amount), {
    message: "amount is required when currency is provided",
  })
  .refine((value) => !value.amountUsdCents || !value.currency, {
    message: "Do not provide currency with amountUsdCents",
  })
  .refine((value) => !value.amountAtomic || !value.currency, {
    message: "Do not provide currency with amountAtomic",
  });
