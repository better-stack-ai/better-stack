/** Copy used by the public careers pages. Values can be replaced through overrides. */
export interface JobBoardLocalization {
	title: string;
	intro: string;
	departmentTitle: string;
	department: string;
	allDepartments: string;
	location: string;
	allLocations: string;
	employmentType: string;
	allEmploymentTypes: string;
	remoteOnly: string;
	remote: string;
	onSite: string;
	fullTime: string;
	partTime: string;
	contract: string;
	internship: string;
	clearFilters: string;
	viewRole: string;
	openRoles: string;
	loadMore: string;
	loadingMore: string;
	loading: string;
	emptyTitle: string;
	emptyDescription: string;
	filteredEmptyDescription: string;
	errorTitle: string;
	errorDescription: string;
	retry: string;
	notFoundTitle: string;
	notFoundDescription: string;
	backToJobs: string;
	aboutRole: string;
	requirements: string;
	salary: string;
	closingDate: string;
	apply: string;
	application: string;
	applicationDescription: string;
	applicationsUnavailable: string;
	workplace: string;
}

export const jobBoardLocalization: JobBoardLocalization = {
	title: "Open roles",
	intro: "Find a role by team, location and employment type.",
	departmentTitle: "{department} roles",
	department: "Department",
	allDepartments: "All departments",
	location: "Location",
	allLocations: "All locations",
	employmentType: "Employment type",
	allEmploymentTypes: "All employment types",
	remoteOnly: "Remote roles only",
	remote: "Remote",
	onSite: "On site",
	fullTime: "Full time",
	partTime: "Part time",
	contract: "Contract",
	internship: "Internship",
	clearFilters: "Clear filters",
	viewRole: "View role",
	openRoles: "{count} open roles",
	loadMore: "Show more roles",
	loadingMore: "Loading more roles…",
	loading: "Loading open roles…",
	emptyTitle: "No open roles",
	emptyDescription:
		"There are no open positions right now. Check back for new roles.",
	filteredEmptyDescription:
		"No roles match these filters. Change a filter or clear them to see other positions.",
	errorTitle: "Open roles could not be loaded",
	errorDescription: "Check your connection and try loading the roles again.",
	retry: "Try again",
	notFoundTitle: "This role is no longer available",
	notFoundDescription:
		"The role may have closed or the link may have changed. See the current open positions.",
	backToJobs: "All open roles",
	aboutRole: "About the role",
	requirements: "What you will bring",
	salary: "Salary",
	closingDate: "Applications close",
	apply: "Apply for this role",
	application: "Your application",
	applicationDescription: "Complete the application form for this role.",
	applicationsUnavailable: "Applications are not available for this role.",
	workplace: "Workplace",
};
