import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { Effect } from "effect";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { _clearProjectCache } from "@/resolve";

const BASE = "http://cycles-ext-test.local";
const WS = "testws";

const PROJECTS = [
	{ id: "proj-acme", identifier: "ACME", name: "Acme Project" },
];
const PROJECT_DETAIL = {
	id: "proj-acme",
	identifier: "ACME",
	name: "Acme Project",
	module_view: true,
	cycle_view: true,
	issue_views_view: true,
	page_view: true,
	inbox_view: true,
};
const ISSUES = [
	{
		id: "i1",
		sequence_id: 29,
		name: "Migrate Button",
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
	{ id: "cyc2", name: "Sprint 2", status: "backlog" },
];
const CYCLE_ISSUES = [
	{
		id: "ci1",
		issue: "i1",
		issue_detail: { id: "i1", sequence_id: 29, name: "Migrate Button" },
	},
];

const server = setupServer(
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/`, () =>
		HttpResponse.json({ results: PROJECTS }),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/`, () =>
		HttpResponse.json(PROJECT_DETAIL),
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

describe("cyclesList", () => {
	it("lists cycles with status and dates", async () => {
		const { cyclesListHandler } = await import("@/commands/cycles");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(cyclesListHandler({ project: "ACME" }));
		} finally {
			console.log = orig;
		}
		const output = logs.join("\n");
		expect(output).toContain("cyc1");
		expect(output).toContain("Sprint 1");
		expect(output).toContain("started");
		expect(output).toContain("2025-01-01");
	});

	it("shows em-dash for missing dates", async () => {
		const { cyclesListHandler } = await import("@/commands/cycles");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(cyclesListHandler({ project: "ACME" }));
		} finally {
			console.log = orig;
		}
		expect(logs.join("\n")).toContain("—");
	});

	it("shows 'No cycles found' when empty", async () => {
		server.use(
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/cycles/`,
				() => HttpResponse.json({ results: [] }),
			),
		);
		const { cyclesListHandler } = await import("@/commands/cycles");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(cyclesListHandler({ project: "ACME" }));
		} finally {
			console.log = orig;
		}
		expect(logs.join("\n")).toBe("No cycles found");
	});
});

describe("cycleIssuesList", () => {
	it("lists issues in a cycle", async () => {
		const { cycleIssuesListHandler } = await import("@/commands/cycles");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				cycleIssuesListHandler({ project: "ACME", cycleId: "cyc1" }),
			);
		} finally {
			console.log = orig;
		}
		const output = logs.join("\n");
		expect(output).toContain("ACME-");
		expect(output).toContain("29");
		expect(output).toContain("Migrate Button");
	});

	it("falls back to issue UUID without detail", async () => {
		server.use(
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/cycles/cyc1/cycle-issues/`,
				() =>
					HttpResponse.json({ results: [{ id: "ci2", issue: "bare-uuid" }] }),
			),
		);
		const { cycleIssuesListHandler } = await import("@/commands/cycles");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				cycleIssuesListHandler({ project: "ACME", cycleId: "cyc1" }),
			);
		} finally {
			console.log = orig;
		}
		expect(logs.join("\n")).toContain("bare-uuid");
	});

	it("shows 'No issues in cycle' when empty", async () => {
		server.use(
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/cycles/cyc1/cycle-issues/`,
				() => HttpResponse.json({ results: [] }),
			),
		);
		const { cycleIssuesListHandler } = await import("@/commands/cycles");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				cycleIssuesListHandler({ project: "ACME", cycleId: "cyc1" }),
			);
		} finally {
			console.log = orig;
		}
		expect(logs.join("\n")).toBe("No issues in cycle");
	});
});

describe("cycleIssuesAdd", () => {
	it("adds an issue to a cycle", async () => {
		let postedBody: unknown;
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/cycles/cyc1/cycle-issues/`,
				async ({ request }) => {
					postedBody = await request.json();
					return HttpResponse.json({ issues: ["i1"] }, { status: 201 });
				},
			),
		);
		const { cycleIssuesAddHandler } = await import("@/commands/cycles");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				cycleIssuesAddHandler({
					project: "ACME",
					cycleId: "cyc1",
					ref: "ACME-29",
				}),
			);
		} finally {
			console.log = orig;
		}
		expect((postedBody as { issues?: string[] }).issues).toContain("i1");
		expect(logs.join("\n")).toContain("ACME-29");
		expect(logs.join("\n")).toContain("cyc1");
	});
});
