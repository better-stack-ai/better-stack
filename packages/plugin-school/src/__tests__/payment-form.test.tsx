// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseDetailPage } from "../client/components/pages/course-detail-page.internal";

const state = vi.hoisted(() => ({
	identityId: "student-current" as string | null,
	enrollmentId: "enrollment-current",
	courseId: "course-current",
	mutateAsync: vi.fn(),
	checkout: {
		id: "enrollment-current",
		userId: "student-current",
		checkout: { clientSecret: "current-student-secret" },
	} as
		| { id: string; userId: string; checkout: { clientSecret: string } }
		| undefined,
}));

vi.mock("@btst/stack/context", () => ({
	useIdentity: () => ({
		identity: state.identityId ? { id: state.identityId } : null,
	}),
	usePluginOverrides: () => ({
		renderPayment: (checkout: { clientSecret?: string }) =>
			`Payment form: ${checkout.clientSecret}`,
	}),
	usePluginSiteNavigation: () => ({
		Link: "a",
		navigate: () => {},
		resolve: (...parts: string[]) => ({ href: `/pages/${parts.join("/")}` }),
	}),
}));
vi.mock("../client/hooks", () => ({
	useSuspenseCourse: () => ({
		data: {
			id: state.courseId,
			title: "Paid course",
			price: 2500,
			difficulty: "beginner",
			lessonCount: 0,
			durationMins: 0,
			lessons: [],
			tags: [],
			reviews: [],
		},
	}),
	useMyCourses: () => ({
		data: [
			{
				id: state.enrollmentId,
				courseId: state.courseId,
				userId: state.identityId,
				status: "pending_payment",
			},
		],
	}),
	useEnroll: () => ({ data: state.checkout, mutateAsync: state.mutateAsync }),
	school: { schoolCourses: { review: { use: () => ({}) } } },
}));
vi.mock("../client/components/pages/school-shared", () => ({
	SchoolShell: ({ children }: { children: ReactNode }) => children,
	Curriculum: () => null,
	ErrorMessage: () => null,
	Progress: () => null,
	priceLabel: () => "$25.00",
}));

describe("School payment form ownership", () => {
	beforeEach(() => {
		state.identityId = "student-current";
		state.enrollmentId = "enrollment-current";
		state.courseId = "course-current";
		state.mutateAsync.mockReset();
		state.checkout = {
			id: "enrollment-current",
			userId: "student-current",
			checkout: { clientSecret: "current-student-secret" },
		};
	});
	const render = () =>
		renderToStaticMarkup(
			createElement(CourseDetailPage, { slug: "paid-course" }),
		);

	it("renders the current student's matching enrollment checkout", () => {
		expect(render()).toContain("Payment form: current-student-secret");
	});
	it("hides retained credentials from a previous enrollment", () => {
		state.checkout!.id = "enrollment-previous";
		state.checkout!.checkout.clientSecret = "previous-enrollment-secret";
		const html = render();
		expect(html).not.toContain("previous-enrollment-secret");
		expect(html).toContain("Continue payment");
	});
	it("hides retained credentials for another identity even when enrollment IDs match", () => {
		state.checkout!.userId = "student-previous";
		state.checkout!.checkout.clientSecret = "previous-student-secret";
		const html = render();
		expect(html).not.toContain("previous-student-secret");
		expect(html).toContain("Continue payment");
	});

	describe("deferred hosted checkout", () => {
		let container: HTMLDivElement;
		let root: Root | null;
		const assign = vi.fn();
		const response = {
			id: "enrollment-current",
			courseId: "course-current",
			userId: "student-current",
			status: "pending_payment",
			checkout: {
				redirectUrl: "https://payments.example.test/student-current",
			},
		};
		beforeEach(async () => {
			(
				globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
			).IS_REACT_ACT_ENVIRONMENT = true;
			state.checkout = undefined;
			assign.mockReset();
			container = document.createElement("div");
			document.body.append(container);
			root = createRoot(container);
			await act(async () =>
				root!.render(createElement(CourseDetailPage, { slug: "paid-course" })),
			);
			const actualWindow = window;
			vi.stubGlobal(
				"window",
				new Proxy(actualWindow, {
					get: (target, key) =>
						key === "location" ? { assign } : Reflect.get(target, key, target),
				}),
			);
		});
		afterEach(async () => {
			if (root) await act(async () => root!.unmount());
			container.remove();
			vi.unstubAllGlobals();
		});
		async function beginCheckout() {
			let release!: (value: typeof response) => void;
			const pending = new Promise<typeof response>((resolve) => {
				release = resolve;
			});
			state.mutateAsync.mockReturnValue(pending);
			const button = [...container.querySelectorAll("button")].find(
				(element) => element.textContent === "Continue payment",
			);
			expect(button).toBeDefined();
			await act(async () => button!.click());
			expect(state.mutateAsync).toHaveBeenCalledWith("course-current");
			return async () => {
				await act(async () => {
					release(response);
					await pending;
				});
			};
		}
		it("redirects a matching response while its original context is still mounted", async () => {
			const finish = await beginCheckout();
			await finish();
			expect(assign).toHaveBeenCalledExactlyOnceWith(
				response.checkout.redirectUrl,
			);
		});
		it.each(["identity change", "logout", "course change", "unmount"])(
			"ignores a late checkout response after %s",
			async (change) => {
				const finish = await beginCheckout();
				if (change === "unmount") {
					await act(async () => root!.unmount());
					root = null;
				} else {
					state.identityId =
						change === "logout"
							? null
							: change === "course change"
								? "student-current"
								: "student-next";
					state.courseId =
						change === "course change" ? "course-next" : "course-current";
					state.enrollmentId = "enrollment-next";
					await act(async () =>
						root!.render(
							createElement(CourseDetailPage, {
								slug:
									change === "course change" ? "next-course" : "paid-course",
							}),
						),
					);
				}
				await finish();
				expect(assign).not.toHaveBeenCalled();
			},
		);
	});
});
