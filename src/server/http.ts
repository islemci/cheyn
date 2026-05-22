import { ZodError, type ZodType } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

type ApiErrorContext = {
  metadata?: Record<string, unknown>;
  requestId?: string;
  route?: string;
  stage?: string;
};

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

export async function parseJson<T>(request: Request, schema: ZodType<T>) {
  try {
    const body = await request.json();
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ApiError(
        400,
        error.issues[0]?.message ?? "Invalid request body",
      );
    }
    throw new ApiError(400, "Invalid JSON request body");
  }
}

function logApiError(error: unknown, context?: ApiErrorContext) {
  const cause =
    error instanceof Error && error.cause instanceof Error
      ? {
          causeMessage: error.cause.message,
          causeName: error.cause.name,
          causeStack: error.cause.stack,
        }
      : undefined;

  console.error("[api-error]", {
    ...context,
    error:
      error instanceof Error
        ? {
            message: error.message,
            name: error.name,
            stack: error.stack,
            ...cause,
          }
        : error,
  });
}

export function handleApiError(error: unknown, context?: ApiErrorContext) {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      logApiError(error, context);
    }
    return json(
      {
        error: error.message,
        ...(context?.requestId ? { requestId: context.requestId } : {}),
      },
      { status: error.status },
    );
  }

  logApiError(error, context);
  return json(
    {
      error: "Internal server error",
      ...(context?.requestId ? { requestId: context.requestId } : {}),
    },
    { status: 500 },
  );
}
