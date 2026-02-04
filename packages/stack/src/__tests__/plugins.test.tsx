import { describe, it, expect } from "vitest";
import { stack } from "../api";
import { createStackClient } from "../client";
import { defineBackendPlugin } from "../plugins/api";
import { defineClientPlugin } from "../plugins/client";
import type { BackendPlugin, ClientPlugin } from "../types";
import type { BetterAuthDBSchema, DatabaseDefinition, Adapter } from "@btst/db";
import { createDbPlugin } from "@btst/db";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { createEndpoint as endpoint } from "better-call";
import { z } from "zod";
import { createRoute } from "@btst/yar";

/**
 * Adapter wrapper for testing
 * Wraps createMemoryAdapter to match the expected signature
 */
const testAdapter = (db: DatabaseDefinition): Adapter => {
	return createMemoryAdapter(db)({});
};

/**
 * Test schema for messages plugin
 * Using BetterAuthDBSchema format
 */
const messagesSchema: BetterAuthDBSchema = {
	messages: {
		modelName: "Message",
		fields: {
			id: {
				type: "number",
				unique: true,
				required: true,
			},
			content: {
				type: "string",
				required: true,
			},
			userId: {
				type: "string",
				required: true,
			},
			createdAt: {
				type: "number",
				required: true,
			},
		},
	},
};

/**
 * Test backend plugin - Messages
 * Demonstrates how to build a 3rd party plugin using BTST
 * Now using defineBackendPlugin for full type inference - no casts needed!
 */
const messagesBackendPlugin = defineBackendPlugin({
	name: "messages",
	dbPlugin: createDbPlugin("messages", messagesSchema),
	routes: (adapter) => ({
		list: endpoint(
			"/messages",
			{
				method: "GET",
				query: z.object({
					userId: z.string().optional(),
				}),
			},
			async ({ query }) => {
				const messages = await adapter.findMany({
					model: "messages",
					where: query.userId
						? [{ field: "userId", value: query.userId, operator: "eq" }]
						: undefined,
				});
				return {
					status: 200,
					body: messages,
				};
			},
		),
		create: endpoint(
			"/messages",
			{
				method: "POST",
				body: z.object({
					content: z.string().min(1),
					userId: z.string().min(1),
				}),
			},
			async ({ body }) => {
				const message = await adapter.create({
					model: "messages",
					data: { ...body, id: Date.now(), createdAt: Date.now() },
				});
				return {
					status: 201,
					body: message,
				};
			},
		),
		delete: endpoint(
			"/messages/:id",
			{
				method: "DELETE",
				params: z.object({
					id: z.coerce.number(),
				}),
			},
			async ({ params }) => {
				await adapter.delete({
					model: "messages",
					where: [{ field: "id", value: params.id, operator: "eq" }],
				});
				return {
					status: 204,
					body: null,
				};
			},
		),
	}),
});

/**
 * Test components for client plugin
 */
const MessagesListComponent = () => {
	return <div>Messages List</div>;
};

const MessageDetailComponent = () => {
	return <div>Message Detail</div>;
};

/**
 * Test loaders for client plugin
 */
const messagesListLoader = async () => {
	return { messages: [{ id: 1, content: "Test message" }] };
};

const messageDetailLoader = async ({ params }: { params: { id: string } }) => {
	return { message: { id: params.id, content: "Detail message" } };
};

/**
 * Test client plugin - Messages
 * Now using defineClientPlugin for full type inference - no casts needed!
 * Using Yar's createRoute() to create proper route handlers.
 */
const messagesClientPlugin = defineClientPlugin({
	name: "messages",
	routes: () => ({
		messagesList: createRoute("/messages", () => ({
			PageComponent: MessagesListComponent,
			loader: messagesListLoader,
		})),
		messageDetail: createRoute("/messages/:id", ({ params }) => ({
			PageComponent: MessageDetailComponent,
			loader: () => messageDetailLoader({ params }),
		})),
	}),
});

describe("3rd Party Plugin Support", () => {
	describe("Backend Plugin", () => {
		it("should create backend with custom plugin", () => {
			const backend = stack({
				basePath: "/api",
				plugins: {
					messages: messagesBackendPlugin,
				},
				adapter: testAdapter,
			});

			expect(backend).toBeDefined();
			expect(backend.handler).toBeDefined();
			expect(backend.router).toBeDefined();
			expect(backend.dbSchema).toBeDefined();
		});

		it("should create backend with multiple custom plugins", () => {
			// Create a second plugin
			const notificationsSchema: BetterAuthDBSchema = {
				notifications: {
					modelName: "Notification",
					fields: {
						id: {
							type: "number",
							unique: true,
							required: true,
						},
						message: {
							type: "string",
							required: true,
						},
					},
				},
			};

			const notificationsPlugin = defineBackendPlugin({
				name: "notifications",
				dbPlugin: createDbPlugin("notifications", notificationsSchema),
				routes: (adapter) => ({
					list: endpoint(
						"/notifications",
						{
							method: "GET",
						},
						async () => {
							const notifications = await adapter.findMany({
								model: "notifications",
							});
							return {
								status: 200,
								body: notifications,
							};
						},
					),
				}),
			});

			const backend = stack({
				basePath: "/api",
				plugins: {
					messages: messagesBackendPlugin,
					notifications: notificationsPlugin,
				},
				adapter: testAdapter,
			});

			expect(backend).toBeDefined();
			expect(backend.router).toBeDefined();
		});

		it("should generate routes for custom plugin", () => {
			const backend = stack({
				basePath: "/api",
				plugins: {
					messages: messagesBackendPlugin,
				},
				adapter: testAdapter,
			});

			// Check that routes are properly registered
			// The router should have routes prefixed with plugin name
			expect(backend.router).toBeDefined();
			expect(typeof backend.router.handler).toBe("function");
		});

		it("should include plugin schema in database", () => {
			const backend = stack({
				basePath: "/api",
				plugins: {
					messages: messagesBackendPlugin,
				},
				adapter: testAdapter,
			});

			// Check that the schema includes the messages table
			expect(backend.dbSchema).toBeDefined();
			expect(backend.dbSchema.schema).toBeDefined();
			expect(backend.dbSchema.schema.messages).toBeDefined();
		});
	});

	describe("Client Plugin", () => {
		it("should create client with custom plugin", () => {
			const client = createStackClient({
				plugins: {
					messages: messagesClientPlugin,
				},
			});

			expect(client).toBeDefined();
			expect(client.router).toBeDefined();
		});

		it("should have routes from custom plugin", () => {
			const client = createStackClient({
				plugins: {
					messages: messagesClientPlugin,
				},
			});

			// Verify the router is created and has the expected structure
			expect(client.router).toBeDefined();
			expect(typeof client.router).toBe("object");
		});

		it("should return correct route shape with Component and loader", async () => {
			// Test the route object directly from the plugin - types are now preserved!
			const routes = messagesClientPlugin.routes();
			const listRoute = routes.messagesList;

			expect(listRoute).toBeDefined();
			expect(typeof listRoute).toBe("function"); // Yar routes ARE functions
			expect(listRoute.path).toBe("/messages");

			// Call the route handler to get the route data
			const routeData = listRoute();
			expect(routeData).toBeDefined();
			// Handler returns PageComponent
			expect(routeData.PageComponent).toBeDefined();
			expect(typeof routeData.PageComponent).toBe("function");
			expect(routeData.loader).toBeDefined();
			expect(typeof routeData.loader).toBe("function");

			// Verify PageComponent returns expected shape
			expect(routeData.PageComponent).toBeDefined();

			// Verify loader returns expected shape
			const data = await routeData.loader?.();
			expect(data).toBeDefined();
			expect(data?.messages).toBeDefined();
			expect(Array.isArray(data?.messages)).toBe(true);
		});

		it("should return correct route shape with params", async () => {
			// Test the route object directly from the plugin - types are now preserved!
			const routes = messagesClientPlugin.routes();
			const detailRoute = routes.messageDetail;

			expect(detailRoute).toBeDefined();
			expect(typeof detailRoute).toBe("function"); // Yar routes ARE functions
			expect(detailRoute.path).toBe("/messages/:id");

			// Call the route handler with params to get the route data
			const routeData = detailRoute({ params: { id: "123" } });
			expect(routeData).toBeDefined();
			// Handler returns PageComponent
			expect(routeData.PageComponent).toBeDefined();
			expect(typeof routeData.PageComponent).toBe("function");
			expect(routeData.loader).toBeDefined();
			expect(typeof routeData.loader).toBeDefined();

			// Verify loader can be called
			const data = await routeData.loader?.();
			expect(data).toBeDefined();
			expect(data?.message).toBeDefined();
			expect(data?.message.id).toBe("123");
		});

		it("should have all expected routes defined", () => {
			const routes = messagesClientPlugin.routes();

			// Verify all expected routes exist - types are fully inferred!
			expect(routes.messagesList).toBeDefined();
			expect(routes.messageDetail).toBeDefined();

			// Verify route paths (Yar routes have .path property)
			expect(routes.messagesList.path).toBe("/messages");
			expect(routes.messageDetail.path).toBe("/messages/:id");
		});

		it("should maintain type safety across route definitions", async () => {
			// This test verifies that TypeScript types are preserved
			const routes = messagesClientPlugin.routes();
			const route = routes.messagesList;

			// Route should be a function (Yar's handler)
			expect(typeof route).toBe("function");

			// Calling route handler returns route data
			const routeData = route();
			// Handler returns PageComponent
			expect(routeData.PageComponent).toBeDefined();

			// PageComponent should be callable
			expect(routeData.PageComponent).toBeDefined();

			// Loader should be callable and return a promise
			const loaderResult = routeData.loader?.();
			expect(loaderResult).toBeInstanceOf(Promise);
			await loaderResult; // Ensure it resolves
		});

		it("should support multiple client plugins", () => {
			const NotificationsComponent: React.FC = () => {
				return <div>Notifications</div>;
			};

			const notificationsLoader = async () => {
				return { notifications: [{ id: 1, message: "Test notification" }] };
			};

			const notificationsClientPlugin = defineClientPlugin({
				name: "notifications",
				routes: () => ({
					notificationsList: createRoute("/notifications", () => ({
						PageComponent: NotificationsComponent,
						loader: notificationsLoader,
					})),
				}),
			});

			const client = createStackClient({
				plugins: {
					messages: messagesClientPlugin,
					notifications: notificationsClientPlugin,
				},
			});

			// Verify the router is created with both plugins
			expect(client.router).toBeDefined();

			// Verify both plugin routes are accessible from their definitions - full type safety!
			const messagesRoutes = messagesClientPlugin.routes();
			const notificationsRoutes = notificationsClientPlugin.routes();

			expect(messagesRoutes.messagesList).toBeDefined();
			expect(typeof messagesRoutes.messagesList).toBe("function");
			expect(messagesRoutes.messagesList.path).toBe("/messages");

			expect(notificationsRoutes.notificationsList).toBeDefined();
			expect(typeof notificationsRoutes.notificationsList).toBe("function");
			expect(notificationsRoutes.notificationsList.path).toBe("/notifications");
		});
	});

	describe("Separate Backend and Client Plugins", () => {
		it("should use backend and client plugins independently", () => {
			// Backend and client plugins are completely separate
			// This prevents SSR issues and enables better code splitting
			const backend = stack({
				basePath: "/api",
				plugins: {
					messages: messagesBackendPlugin,
				},
				adapter: testAdapter,
			});

			const client = createStackClient({
				plugins: {
					messages: messagesClientPlugin,
				},
			});

			expect(backend.router).toBeDefined();
			expect(client.router).toBeDefined();
		});

		it("should demonstrate proper route usage pattern", async () => {
			// This test mimics the actual usage pattern in a Next.js app
			// Uses router.getRoute() to match paths and get route handlers

			const client = createStackClient({
				plugins: {
					messages: messagesClientPlugin,
				},
			});

			// Test route resolution by path
			const matchedRoute = client.router.getRoute("/messages");

			expect(matchedRoute).toBeDefined();
			expect(matchedRoute).not.toBeNull();

			if (matchedRoute) {
				// Route should have the expected properties from Yar
				expect(matchedRoute.params).toBeDefined();

				// Yar's getRoute() returns the route handler's result
				// which includes PageComponent and loader
				expect(matchedRoute.PageComponent).toBeDefined();
				expect(typeof matchedRoute.PageComponent).toBe("function");

				// Can render the component
				if (matchedRoute.PageComponent) {
					const rendered = <matchedRoute.PageComponent />;
					expect(rendered).toBeDefined();
				}

				// Verify loader is present and callable
				expect(matchedRoute.loader).toBeDefined();
				expect(typeof matchedRoute.loader).toBe("function");

				// Can call the loader and get data - type is inferred from loader
				const data = await matchedRoute.loader?.();
				expect(data).toBeDefined();

				// TypeScript knows this is a union of all route loaders
				// Narrow by checking which properties exist
				if (data && "messages" in data) {
					// This is the messagesList route
					expect(data.messages).toBeDefined();
					expect(Array.isArray(data.messages)).toBe(true);
				}
			}
		});

		it("should handle parameterized routes correctly", async () => {
			// Test that router.getRoute() correctly extracts path parameters
			const client = createStackClient({
				plugins: {
					messages: messagesClientPlugin,
				},
			});

			// Match a route with params
			const matchedRoute = client.router.getRoute("/messages/42");

			expect(matchedRoute).toBeDefined();
			expect(matchedRoute).not.toBeNull();

			if (matchedRoute) {
				// Yar should extract params from the path
				expect(matchedRoute.params).toBeDefined();
				expect(matchedRoute.params.id).toBe("42");

				// getRoute() returns the handler result with PageComponent and loader
				expect(matchedRoute.PageComponent).toBeDefined();
				expect(matchedRoute.loader).toBeDefined();

				// Loader should be callable - type is properly inferred from the route
				const data = await matchedRoute.loader?.();
				expect(data).toBeDefined();

				// TypeScript knows this is a union type from both routes
				// We can narrow by checking which properties exist
				if (data && "message" in data) {
					// This is the messageDetail route
					expect(data.message).toBeDefined();
					expect(data.message.id).toBe("42");
				}
			}
		});
	});

	describe("Plugin Type Exports", () => {
		it("should export all necessary types for building plugins", () => {
			// This test verifies the types are available at compile time
			const backendPlugin: BackendPlugin = messagesBackendPlugin;
			const clientPlugin: ClientPlugin = messagesClientPlugin;

			expect(backendPlugin.name).toBe("messages");
			expect(clientPlugin.name).toBe("messages");
		});
	});
});
