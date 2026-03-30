/**
 * Tests for JSON output mode (--json flag) in list commands.
 * mock.module must be called before any command modules are imported.
 */
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

// Set jsonMode=true for this entire test file before command modules load
mock.module("@/output", () => ({
	jsonMode: true,
	xmlMode: false,
	toXml,
}));

const BASE = "http://json-output-test.local";
const WS = "testws";

const PROJECTS = [{ id: "proj-acme", identifier: "ACME", name: "Acme" }];
const ISSUES = [
	{
		id: "i1",
		sequence_id: 1,
		name: "Issue One",
		priority: "high",
		state: "s1",
	},
];
const CYCLES = [
	{
		id: "cyc1",
		name: "Sprint 1",
		status: "started",
		start_date: "2025-01-01",
		end_date: "2025-01-14",
	},
];
const CYCLE_ISSUES = [
	{
		id: "ci1",
		issue: "i1",
		issue_detail: { id: "i1", sequence_id: 1, name: "Issue One" },
	},
];
const MODULES = [{ id: "mod1", name: "Module Alpha", status: "in-progress" }];
const MODULE_ISSUES = [
	{
		id: "mi1",
		issue: "i1",
		issue_detail: { id: "i1", sequence_id: 1, name: "Issue One" },
	},
];
const INTAKE_ISSUES = [
	{
		id: "int1",
		status: 0,
		created_at: "2025-01-15T10:00:00Z",
		issue_detail: {
			id: "i1",
			sequence_id: 1,
			name: "Bug report",
			priority: "high",
		},
	},
];
const PAGES = [
	{
		id: "pg1",
		name: "My Page",
		created_at: "2025-01-10T10:00:00Z",
		updated_at: "2025-01-15T10:00:00Z",
	},
];
const ACTIVITIES = [
	{
		id: "act1",
		actor_detail: { display_name: "Alice" },
		field: "state",
		old_value: "Backlog",
		new_value: "Done",
		verb: "updated",
		created_at: "2025-01-15T10:30:00Z",
	},
];
const LINKS = [
	{
		id: "lnk1",
		url: "https://example.com",
		title: "Example",
		created_at: "2025-01-10T00:00:00Z",
	},
];
const COMMENTS = [
	{
		id: "cmt1",
		comment_html: "<p>Hello</p>",
		actor_detail: { display_name: "Bob" },
		created_at: "2025-01-10T00:00:00Z",
	},
];
const WORKLOGS = [
	{
		id: "wl1",
		duration: 3600,
		logged_by_detail: { display_name: "Carol" },
		created_at: "2025-01-10T00:00:00Z",
	},
];
const STATES = [{ id: "s1", name: "In Progress", group: "started" }];

const server = setupServer(
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/`, () =>
		HttpResponse.json({ results: PROJECTS }),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`, () =>
		HttpResponse.json({ results: ISSUES }),
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
	http.get(
		`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/intake-issues/`,
		() => HttpResponse.json({ results: INTAKE_ISSUES }),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/pages/`, () =>
		HttpResponse.json({ results: PAGES }),
	),
	http.get(
		`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/activities/`,
		() => HttpResponse.json({ results: ACTIVITIES }),
	),
	http.get(
		`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/issue-links/`,
		() => HttpResponse.json({ results: LINKS }),
	),
	http.get(
		`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/comments/`,
		() => HttpResponse.json({ results: COMMENTS }),
	),
	http.get(
		`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/worklogs/`,
		() => HttpResponse.json({ results: WORKLOGS }),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/states/`, () =>
		HttpResponse.json({ results: STATES }),
	),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => {
	server.close();
	// Restore the real output module so subsequent test files are not affected
	mock.module("@/output", () => ({
		jsonMode: false,
		xmlMode: false,
		toXml,
	}));
});

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

describe("cyclesList --json", () => {
	it("outputs JSON array of cycles", async () => {
		const { cyclesListHandler } = await import("@/commands/cycles");
		const output = await captureLogs(() =>
			Effect.runPromise(cyclesListHandler({ project: "ACME" })),
		);
		const parsed = JSON.parse(output);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0].id).toBe("cyc1");
	});
});

describe("cycleIssuesList --json", () => {
	it("outputs JSON array of cycle issues", async () => {
		const { cycleIssuesListHandler } = await import("@/commands/cycles");
		const output = await captureLogs(() =>
			Effect.runPromise(
				cycleIssuesListHandler({ project: "ACME", cycleId: "cyc1" }),
			),
		);
		const parsed = JSON.parse(output);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0].id).toBe("ci1");
	});
});

describe("modulesList --json", () => {
	it("outputs JSON array of modules", async () => {
		const { modulesListHandler } = await import("@/commands/modules");
		const output = await captureLogs(() =>
			Effect.runPromise(modulesListHandler({ project: "ACME" })),
		);
		const parsed = JSON.parse(output);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0].id).toBe("mod1");
	});
});

describe("moduleIssuesList --json", () => {
	it("outputs JSON array of module issues", async () => {
		const { moduleIssuesListHandler } = await import("@/commands/modules");
		const output = await captureLogs(() =>
			Effect.runPromise(
				moduleIssuesListHandler({
					project: "ACME",
					moduleId: "mod1",
				}),
			),
		);
		const parsed = JSON.parse(output);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0].id).toBe("mi1");
	});
});

describe("intakeList --json", () => {
	it("outputs JSON array of intake issues", async () => {
		const { intakeListHandler } = await import("@/commands/intake");
		const output = await captureLogs(() =>
			Effect.runPromise(intakeListHandler({ project: "ACME" })),
		);
		const parsed = JSON.parse(output);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0].id).toBe("int1");
	});
});

describe("pagesList --json", () => {
	it("outputs JSON array of pages", async () => {
		const { pagesListHandler } = await import("@/commands/pages");
		const output = await captureLogs(() =>
			Effect.runPromise(pagesListHandler({ project: "ACME" })),
		);
		const parsed = JSON.parse(output);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0].id).toBe("pg1");
	});
});

describe("issueActivity --json", () => {
	it("outputs JSON array of activities", async () => {
		const { issueActivityHandler } = await import("@/commands/issue");
		const output = await captureLogs(() =>
			Effect.runPromise(issueActivityHandler({ ref: "ACME-1" })),
		);
		const parsed = JSON.parse(output);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0].id).toBe("act1");
	});
});

describe("issueLinkList --json", () => {
	it("outputs JSON array of links", async () => {
		const { issueLinkListHandler } = await import("@/commands/issue");
		const output = await captureLogs(() =>
			Effect.runPromise(issueLinkListHandler({ ref: "ACME-1" })),
		);
		const parsed = JSON.parse(output);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0].id).toBe("lnk1");
	});
});

describe("issueCommentsList --json", () => {
	it("outputs JSON array of comments", async () => {
		const { issueCommentsListHandler } = await import("@/commands/issue");
		const output = await captureLogs(() =>
			Effect.runPromise(issueCommentsListHandler({ ref: "ACME-1" })),
		);
		const parsed = JSON.parse(output);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0].id).toBe("cmt1");
	});
});

describe("issueWorklogsList --json", () => {
	it("outputs JSON array of worklogs", async () => {
		const { issueWorklogsListHandler } = await import("@/commands/issue");
		const output = await captureLogs(() =>
			Effect.runPromise(issueWorklogsListHandler({ ref: "ACME-1" })),
		);
		const parsed = JSON.parse(output);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0].id).toBe("wl1");
	});
});

describe("issuesList --json", () => {
	it("outputs JSON array of issues", async () => {
		const { issuesListHandler } = await import("@/commands/issues");
		const output = await captureLogs(() =>
			Effect.runPromise(
				issuesListHandler({
					project: "ACME",
					state: Option.none(),
					assignee: Option.none(),
					priority: Option.none(),
				}),
			),
		);
		const parsed = JSON.parse(output);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0].id).toBe("i1");
	});
});
