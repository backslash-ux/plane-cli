import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	mock,
} from "bun:test";
import { Effect, Option } from "effect";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { toXml } from "@/output";
import { _clearProjectCache } from "@/resolve";

const BASE = "http://stats-test.local";
const WS = "testws";

const PROJECTS = [
	{ id: "proj-acme", identifier: "ACME", name: "Acme" },
	{ id: "proj-web", identifier: "WEB", name: "Website" },
	{
		id: "proj-old",
		identifier: "OLD",
		name: "Old Project",
		archived_at: "2025-01-01T00:00:00Z",
	},
];
const PROJECT_DETAILS = {
	"proj-acme": {
		id: "proj-acme",
		identifier: "ACME",
		name: "Acme",
		module_view: true,
		cycle_view: true,
		issue_views_view: true,
		page_view: true,
		inbox_view: true,
	},
	"proj-web": {
		id: "proj-web",
		identifier: "WEB",
		name: "Website",
		module_view: true,
		cycle_view: true,
		issue_views_view: true,
		page_view: true,
		inbox_view: true,
	},
} as const;

const ACME_ISSUES = [
	{
		id: "i1",
		sequence_id: 1,
		name: "Issue One",
		priority: "high",
		state: { id: "s1", name: "In Progress", group: "started" },
		assignees: ["m-alice"],
		created_at: "2025-01-10T10:00:00Z",
		completed_at: null,
	},
	{
		id: "i2",
		sequence_id: 2,
		name: "Issue Two",
		priority: "low",
		state: { id: "s2", name: "Done", group: "completed" },
		assignees: ["m-bob"],
		created_at: "2025-01-12T10:00:00Z",
		completed_at: "2025-01-14T10:00:00Z",
	},
	{
		id: "i3",
		sequence_id: 3,
		name: "Issue Three",
		priority: "none",
		state: { id: "s3", name: "Backlog", group: "backlog" },
		assignees: [],
		created_at: "2025-02-01T10:00:00Z",
		completed_at: null,
	},
	{
		id: "i4",
		sequence_id: 4,
		name: "Issue Four",
		priority: "medium",
		state: { id: "s4", name: "Cancelled", group: "cancelled" },
		assignees: ["m-alice"],
		created_at: "2025-01-20T10:00:00Z",
		completed_at: null,
	},
];

const WEB_ISSUES = [
	{
		id: "w1",
		sequence_id: 1,
		name: "Landing refresh",
		priority: "urgent",
		state: { id: "s5", name: "In Progress", group: "started" },
		assignees: [],
		created_at: "2025-01-11T10:00:00Z",
		completed_at: null,
	},
	{
		id: "w2",
		sequence_id: 2,
		name: "Pricing cleanup",
		priority: "medium",
		state: { id: "s6", name: "Done", group: "completed" },
		assignees: ["m-bob"],
		created_at: "2025-02-10T10:00:00Z",
		completed_at: "2025-02-12T10:00:00Z",
	},
];

const OLD_ISSUES = [
	{
		id: "o1",
		sequence_id: 1,
		name: "Archived cleanup",
		priority: "low",
		state: { id: "s7", name: "Done", group: "completed" },
		assignees: [],
		created_at: "2024-12-10T10:00:00Z",
		completed_at: "2024-12-12T10:00:00Z",
	},
];

const MEMBERS = [
	{ id: "m-alice", display_name: "Alice", email: "alice@example.com" },
	{ id: "m-bob", display_name: "Bob", email: "bob@example.com" },
];

const CYCLES = [{ id: "cyc1", name: "Sprint 1", status: "started" }];
const CYCLE_ISSUES = [
	{
		id: "i1",
		sequence_id: 1,
		name: "Issue One",
		priority: "high",
		state: { id: "s1", name: "In Progress", group: "started" },
	},
	{
		id: "i2",
		sequence_id: 2,
		name: "Issue Two",
		priority: "low",
		state: { id: "s2", name: "Done", group: "completed" },
	},
];

const MODULES = [{ id: "mod1", name: "Module Alpha", status: "in-progress" }];
const MODULE_ISSUES = [
	{
		id: "i3",
		sequence_id: 3,
		name: "Issue Three",
		priority: "none",
		state: { id: "s3", name: "Backlog", group: "backlog" },
	},
];

function paginatedIssuesResponse(
	issues: typeof ACME_ISSUES,
	cursor: string | null,
) {
	if (cursor === "2:1:0") {
		return HttpResponse.json({
			results: issues.slice(2),
			next_cursor: null,
			next_page_results: false,
		});
	}

	if (issues.length > 2) {
		return HttpResponse.json({
			results: issues.slice(0, 2),
			next_cursor: "2:1:0",
			next_page_results: true,
		});
	}

	return HttpResponse.json({
		results: issues,
		next_cursor: null,
		next_page_results: false,
	});
}

const server = setupServer(
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/`, () =>
		HttpResponse.json({ results: PROJECTS }),
	),
	http.get(
		`${BASE}/api/v1/workspaces/${WS}/projects/:projectId/`,
		({ params }) =>
			HttpResponse.json(
				PROJECT_DETAILS[params.projectId as "proj-acme" | "proj-web"],
			),
	),
	http.get(
		`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`,
		({ request }) =>
			paginatedIssuesResponse(
				ACME_ISSUES,
				new URL(request.url).searchParams.get("cursor"),
			),
	),
	http.get(
		`${BASE}/api/v1/workspaces/${WS}/projects/proj-web/issues/`,
		({ request }) =>
			paginatedIssuesResponse(
				WEB_ISSUES,
				new URL(request.url).searchParams.get("cursor"),
			),
	),
	http.get(
		`${BASE}/api/v1/workspaces/${WS}/projects/proj-old/issues/`,
		({ request }) =>
			paginatedIssuesResponse(
				OLD_ISSUES,
				new URL(request.url).searchParams.get("cursor"),
			),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/members/`, () =>
		HttpResponse.json(MEMBERS),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/cycles/`, () =>
		HttpResponse.json({ results: CYCLES }),
	),
	http.get(
		`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/cycles/cyc1/cycle-issues/`,
		() => HttpResponse.json({ results: CYCLE_ISSUES }),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/modules/`, () =>
		HttpResponse.json({ results: MODULES }),
	),
	http.get(
		`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/modules/mod1/module-issues/`,
		() => HttpResponse.json({ results: MODULE_ISSUES }),
	),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

beforeEach(() => {
	_clearProjectCache();
	process.env.PLANE_HOST = BASE;
	process.env.PLANE_WORKSPACE = WS;
	process.env.PLANE_API_TOKEN = "test-token";
});

afterEach(() => {
	server.resetHandlers();
	delete process.env.PLANE_HOST;
	delete process.env.PLANE_WORKSPACE;
	delete process.env.PLANE_API_TOKEN;
});

async function captureLogs(fn: () => Promise<void>): Promise<string> {
	const logs: string[] = [];
	const orig = console.log;
	console.log = (...args: unknown[]) => logs.push(args.join(" "));
	try {
		await fn();
	} finally {
		console.log = orig;
	}
	return logs.join("\n");
}

describe("stats command", () => {
	it("aggregates all issues with correct counts", async () => {
		const { statsHandler } = await import("@/commands/stats");
		const output = await captureLogs(() =>
			Effect.runPromise(
				statsHandler({
					project: "ACME",
					since: Option.none(),
					until: Option.none(),
					cycle: Option.none(),
					module: Option.none(),
					assignee: Option.none(),
				}),
			),
		);

		expect(output).toContain("ACME Stats");
		expect(output).toContain("Total issues:    4");
		expect(output).toContain("backlog=1");
		expect(output).toContain("started=1");
		expect(output).toContain("completed=1");
		expect(output).toContain("cancelled=1");
		expect(output).toContain("Created:         4");
		expect(output).toContain("Completed:       1");
		expect(output).toContain("Assignee spread: 3 assigned, 1 unassigned");
	});

	it("counts created and completed in a --since period without shrinking total issues", async () => {
		const { statsHandler } = await import("@/commands/stats");
		const output = await captureLogs(() =>
			Effect.runPromise(
				statsHandler({
					project: "ACME",
					since: Option.some("2025-01-15"),
					until: Option.none(),
					cycle: Option.none(),
					module: Option.none(),
					assignee: Option.none(),
				}),
			),
		);

		expect(output).toContain("ACME Stats (2025-01-15 to ...)");
		expect(output).toContain("Total issues:    4");
		expect(output).toContain("Created:         2 (in range)");
		expect(output).toContain("Completed:       0 (in range)");
	});

	it("counts created and completed in a --until period", async () => {
		const { statsHandler } = await import("@/commands/stats");
		const output = await captureLogs(() =>
			Effect.runPromise(
				statsHandler({
					project: "ACME",
					since: Option.none(),
					until: Option.some("2025-01-15"),
					cycle: Option.none(),
					module: Option.none(),
					assignee: Option.none(),
				}),
			),
		);

		expect(output).toContain("ACME Stats (... to 2025-01-15)");
		expect(output).toContain("Total issues:    4");
		expect(output).toContain("Created:         2 (in range)");
		expect(output).toContain("Completed:       1 (in range)");
	});

	it("counts created and completed in a bounded date range", async () => {
		const { statsHandler } = await import("@/commands/stats");
		const output = await captureLogs(() =>
			Effect.runPromise(
				statsHandler({
					project: "ACME",
					since: Option.some("2025-01-11"),
					until: Option.some("2025-02-01"),
					cycle: Option.none(),
					module: Option.none(),
					assignee: Option.none(),
				}),
			),
		);

		expect(output).toContain("ACME Stats (2025-01-11 to 2025-02-01)");
		expect(output).toContain("Total issues:    4");
		expect(output).toContain("Created:         2 (in range)");
		expect(output).toContain("Completed:       1 (in range)");
	});

	it("filters by --assignee", async () => {
		const { statsHandler } = await import("@/commands/stats");
		const output = await captureLogs(() =>
			Effect.runPromise(
				statsHandler({
					project: "ACME",
					since: Option.none(),
					until: Option.none(),
					cycle: Option.none(),
					module: Option.none(),
					assignee: Option.some("Alice"),
				}),
			),
		);

		expect(output).toContain("Total issues:    2");
		expect(output).toContain("Assignee spread: 2 assigned, 0 unassigned");
	});

	it("scopes to a cycle", async () => {
		const { statsHandler } = await import("@/commands/stats");
		const output = await captureLogs(() =>
			Effect.runPromise(
				statsHandler({
					project: "ACME",
					since: Option.none(),
					until: Option.none(),
					cycle: Option.some("Sprint 1"),
					module: Option.none(),
					assignee: Option.none(),
				}),
			),
		);

		expect(output).toContain("Total issues:    2");
	});

	it("scopes to a module", async () => {
		const { statsHandler } = await import("@/commands/stats");
		const output = await captureLogs(() =>
			Effect.runPromise(
				statsHandler({
					project: "ACME",
					since: Option.none(),
					until: Option.none(),
					cycle: Option.none(),
					module: Option.some("Module Alpha"),
					assignee: Option.none(),
				}),
			),
		);

		expect(output).toContain("Total issues:    1");
	});

	it("aggregates across all projects when project=workspace", async () => {
		const { statsHandler } = await import("@/commands/stats");
		const output = await captureLogs(() =>
			Effect.runPromise(
				statsHandler({
					project: "workspace",
					since: Option.none(),
					until: Option.none(),
					cycle: Option.none(),
					module: Option.none(),
					assignee: Option.none(),
				}),
			),
		);

		expect(output).toContain("Workspace testws Stats");
		expect(output).toContain("Total issues:    6");
		expect(output).toContain("started=2");
		expect(output).toContain("completed=2");
		expect(output).toContain("Created:         6");
		expect(output).toContain("Completed:       2");
		expect(output).toContain("Projects:");
		expect(output).toContain("ACME: total=4, created=4, completed=1");
		expect(output).toContain("WEB: total=2, created=2, completed=1");
		expect(output).not.toContain("OLD:");
	});

	it("includes archived projects in workspace aggregation when requested", async () => {
		const { statsHandler } = await import("@/commands/stats");
		const output = await captureLogs(() =>
			Effect.runPromise(
				statsHandler({
					project: "workspace",
					since: Option.none(),
					until: Option.none(),
					cycle: Option.none(),
					module: Option.none(),
					assignee: Option.none(),
					includeArchived: true,
				}),
			),
		);

		expect(output).toContain("Workspace testws Stats");
		expect(output).toContain("Total issues:    7");
		expect(output).toContain("OLD: total=1, created=1, completed=1");
	});

	it("rejects project-only filters for workspace aggregation", async () => {
		const { statsHandler } = await import("@/commands/stats");
		await expect(
			Effect.runPromise(
				statsHandler({
					project: "workspace",
					since: Option.none(),
					until: Option.none(),
					cycle: Option.none(),
					module: Option.none(),
					assignee: Option.some("Alice"),
				}),
			),
		).rejects.toThrow(
			"Workspace stats currently support only --since and --until.",
		);
	});

	it("skips inaccessible projects in workspace aggregation", async () => {
		server.use(
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-web/issues/`,
				() =>
					new HttpResponse(
						'{"detail":"You do not have permission to perform this action."}',
						{ status: 403 },
					),
			),
		);

		const { statsHandler } = await import("@/commands/stats");
		const output = await captureLogs(() =>
			Effect.runPromise(
				statsHandler({
					project: "workspace",
					since: Option.none(),
					until: Option.none(),
					cycle: Option.none(),
					module: Option.none(),
					assignee: Option.none(),
				}),
			),
		);

		expect(output).toContain("Workspace testws Stats");
		expect(output).toContain("Total issues:    4");
		expect(output).toContain("Skipped projects: WEB");
	});
});

describe("stats --json", () => {
	it("outputs structured JSON stats", async () => {
		mock.module("@/output", () => ({
			jsonMode: true,
			xmlMode: false,
			toXml,
		}));

		// Re-import to pick up mocked output module
		const { statsHandler } = await import("@/commands/stats");
		const output = await captureLogs(() =>
			Effect.runPromise(
				statsHandler({
					project: "ACME",
					since: Option.none(),
					until: Option.none(),
					cycle: Option.none(),
					module: Option.none(),
					assignee: Option.none(),
				}),
			),
		);

		const parsed = JSON.parse(output);
		expect(parsed.project).toBe("ACME");
		expect(parsed.total_issues).toBe(4);
		expect(parsed.by_state_group.started).toBe(1);
		expect(parsed.by_state_group.completed).toBe(1);
		expect(parsed.by_state_group.backlog).toBe(1);
		expect(parsed.by_state_group.cancelled).toBe(1);
		expect(parsed.by_priority.high).toBe(1);
		expect(parsed.by_priority.low).toBe(1);
		expect(parsed.by_priority.none).toBe(1);
		expect(parsed.by_priority.medium).toBe(1);
		expect(parsed.created_in_range).toBe(4);
		expect(parsed.completed_in_range).toBe(1);
		expect(parsed.assigned).toBe(3);
		expect(parsed.unassigned).toBe(1);

		// Restore
		mock.module("@/output", () => ({
			jsonMode: false,
			xmlMode: false,
			toXml,
		}));
	});
});

describe("stats --xml", () => {
	it("outputs XML stats", async () => {
		mock.module("@/output", () => ({
			jsonMode: false,
			xmlMode: true,
			toXml,
		}));

		const { statsHandler } = await import("@/commands/stats");
		const output = await captureLogs(() =>
			Effect.runPromise(
				statsHandler({
					project: "ACME",
					since: Option.none(),
					until: Option.none(),
					cycle: Option.none(),
					module: Option.none(),
					assignee: Option.none(),
				}),
			),
		);

		expect(output).toContain("<results>");
		expect(output).toContain('project="ACME"');
		expect(output).toContain('total_issues="4"');

		// Restore
		mock.module("@/output", () => ({
			jsonMode: false,
			xmlMode: false,
			toXml,
		}));
	});
});

describe("formatStats", () => {
	it("formats stats without date range", () => {
		const { formatStats } = require("@/format");
		const result = formatStats({
			project: "ACME",
			total_issues: 10,
			by_state_group: { backlog: 3, started: 4, completed: 3 },
			by_priority: { high: 5, low: 5 },
			created_in_range: 10,
			completed_in_range: 3,
			assigned: 7,
			unassigned: 3,
		});

		expect(result).toContain("ACME Stats");
		expect(result).toContain("Total issues:    10");
		expect(result).not.toContain("(in range)");
		expect(result).toContain("backlog=3");
		expect(result).toContain("Completed:       3");
		expect(result).toContain("Assignee spread: 7 assigned, 3 unassigned");
	});

	it("formats stats with date range", () => {
		const { formatStats } = require("@/format");
		const result = formatStats({
			project: "TEST",
			period: { since: "2025-01-01", until: "2025-02-01" },
			total_issues: 5,
			by_state_group: { started: 5 },
			by_priority: { medium: 5 },
			created_in_range: 5,
			completed_in_range: 0,
			assigned: 5,
			unassigned: 0,
		});

		expect(result).toContain("TEST Stats (2025-01-01 to 2025-02-01)");
		expect(result).toContain("Created:         5 (in range)");
	});

	it("omits zero-count groups and priorities", () => {
		const { formatStats } = require("@/format");
		const result = formatStats({
			project: "X",
			total_issues: 2,
			by_state_group: { backlog: 0, started: 2, completed: 0 },
			by_priority: { high: 0, medium: 2, low: 0, none: 0 },
			created_in_range: 2,
			completed_in_range: 0,
			assigned: 2,
			unassigned: 0,
		});

		expect(result).toContain("started");
		expect(result).not.toContain("backlog");
		expect(result).toContain("medium");
		expect(result).not.toContain("high");
	});

	it("formats workspace stats with project breakdown", () => {
		const { formatStats } = require("@/format");
		const result = formatStats({
			workspace: "testws",
			total_issues: 6,
			by_state_group: { started: 2, completed: 2, backlog: 1, cancelled: 1 },
			by_priority: { urgent: 1, high: 1, medium: 2, low: 1, none: 1 },
			created_in_range: 6,
			completed_in_range: 2,
			assigned: 4,
			unassigned: 2,
			projects: [
				{
					project: "ACME",
					total_issues: 4,
					by_state_group: { started: 1 },
					by_priority: { high: 1 },
					created_in_range: 4,
					completed_in_range: 1,
					assigned: 3,
					unassigned: 1,
				},
			],
		});

		expect(result).toContain("Workspace testws Stats");
		expect(result).toContain("Projects:");
		expect(result).toContain("ACME: total=4, created=4, completed=1");
	});

	it("formats skipped workspace projects", () => {
		const { formatStats } = require("@/format");
		const result = formatStats({
			workspace: "testws",
			total_issues: 4,
			by_state_group: { started: 1 },
			by_priority: { high: 1 },
			created_in_range: 4,
			completed_in_range: 1,
			assigned: 3,
			unassigned: 1,
			projects: [],
			skipped_projects: ["WEB"],
		});

		expect(result).toContain("Skipped projects: WEB");
	});
});
