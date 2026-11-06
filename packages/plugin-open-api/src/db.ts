import { createDbPlugin } from "@btst/db";

/**
 * OpenAPI plugin doesn't require any database tables
 * It only introspects other plugins' endpoints
 */
export const openApiSchema = createDbPlugin("openApi", {});
