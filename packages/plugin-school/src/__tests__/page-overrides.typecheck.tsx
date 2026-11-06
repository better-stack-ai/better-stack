import type { SchoolPluginOverrides } from "../client/overrides";

const valid: SchoolPluginOverrides = {
	pageOverrides: { catalog: { CourseCard: () => null } },
};
const invalidPage: SchoolPluginOverrides = {
	pageOverrides: {
		// @ts-expect-error Page names use the plugin's route keys.
		unknownPage: { CourseCard: () => null },
	},
};
const invalidSlot: SchoolPluginOverrides = {
	pageOverrides: {
		catalog: {
			// @ts-expect-error Only the page's documented presentation slots are accepted.
			UnknownSlot: () => null,
		},
	},
};
const invalidProps: SchoolPluginOverrides = {
	pageOverrides: {
		catalog: {
			// @ts-expect-error Slot components receive the plugin's typed presentation props.
			CourseCard: (_: { missing: string }) => null,
		},
	},
};
void [valid, invalidPage, invalidSlot, invalidProps];

const curriculum: SchoolPluginOverrides = {
	pageOverrides: {
		lesson: {
			Curriculum: ({ course, activeLessonId, enrollment }) => {
				void [course.lessons, activeLessonId, enrollment?.progressPct];
				return null;
			},
		},
	},
};
const wrongCurriculumProps: SchoolPluginOverrides = {
	pageOverrides: {
		course: {
			// @ts-expect-error Curriculum receives course/enrollment props, not a card's course alone.
			Curriculum: (_: { missing: string }) => null,
		},
	},
};
const wrongPageSlot: SchoolPluginOverrides = {
	pageOverrides: {
		catalog: {
			// @ts-expect-error Curriculum belongs only to course and lesson pages.
			Curriculum: () => null,
		},
	},
};
void [curriculum, wrongCurriculumProps, wrongPageSlot];
