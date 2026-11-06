import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CourseDetailPage } from "../client/components/pages/course-detail-page.internal";

const state = vi.hoisted(() => ({
	checkout: {
		id: "enrollment-current",
		userId: "student-current",
		checkout: { clientSecret: "current-student-secret" },
	},
}));

vi.mock("@btst/stack/context", () => ({
	useIdentity: () => ({ identity: { id: "student-current" } }),
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
			id: "course-current",
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
				id: "enrollment-current",
				courseId: "course-current",
				userId: "student-current",
				status: "pending_payment",
			},
		],
	}),
	useEnroll: () => ({ data: state.checkout }),
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
		state.checkout.id = "enrollment-previous";
		state.checkout.checkout.clientSecret = "previous-enrollment-secret";
		const html = render();
		expect(html).not.toContain("previous-enrollment-secret");
		expect(html).toContain("Continue payment");
	});
	it("hides retained credentials for another identity even when enrollment IDs match", () => {
		state.checkout.userId = "student-previous";
		state.checkout.checkout.clientSecret = "previous-student-secret";
		const html = render();
		expect(html).not.toContain("previous-student-secret");
		expect(html).toContain("Continue payment");
	});
});
