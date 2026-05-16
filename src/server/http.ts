import { ZodError, type ZodType } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

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

export function handleApiError(error: unknown) {
  if (error instanceof ApiError) {
    return json({ error: error.message }, { status: error.status });
  }

  console.error(error);
  return json({ error: "Internal server error" }, { status: 500 });
}
