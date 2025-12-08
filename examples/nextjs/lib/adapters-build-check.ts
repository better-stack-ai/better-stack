/**
 * Build check file for database adapters.
 *
 * This file imports all available adapters to ensure they compile correctly
 * during the build process. This helps catch import/export issues early.
 *
 * NOTE: We still use the memory adapter at runtime - these imports are only
 * for build-time verification.
 */

// Import all adapter factory functions to verify they exist and compile
export { createDrizzleAdapter } from "@btst/adapter-drizzle";
export { createKyselyAdapter } from "@btst/adapter-kysely";
export { createMemoryAdapter } from "@btst/adapter-memory";
export { createMongoDbAdapter } from "@btst/adapter-mongodb";
export { createPrismaAdapter } from "@btst/adapter-prisma";
