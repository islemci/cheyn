import { requireDeveloper } from "@/server/api-auth";
import { convex } from "@/server/convex-client";
import { handleApiError, json, parseJson } from "@/server/http";
import { UpdateStoreSchema } from "@/server/schemas";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ storeId: string }> },
) {
  try {
    const developer = await requireDeveloper(request);
    const { storeId } = await context.params;
    const input = await parseJson(request, UpdateStoreSchema);

    const result = await convex.mutation<{ storeId: string }>(
      convex.refs.updateStore,
      {
        ...input,
        developerId: developer.id,
        storeId,
      },
    );

    return json({ storeId: result.storeId });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ storeId: string }> },
) {
  try {
    const developer = await requireDeveloper(request);
    const { storeId } = await context.params;

    const result = await convex.mutation<{ storeId: string }>(
      convex.refs.deleteStore,
      {
        developerId: developer.id,
        now: Date.now(),
        storeId,
      },
    );

    return json({ storeId: result.storeId });
  } catch (error) {
    return handleApiError(error);
  }
}
