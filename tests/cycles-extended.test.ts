import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { Effect, Option } from "effect";
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
		total_issues: 10,
		completed_issues: 3,
		cancelled_issues: 0,
		started_issues: 4,
		unstarted_issues: 3,
		backlog_issues: 0,
	},
	{ id: "cyc2", name: "Sprint 2", status: "backlog" },
];
const CYCLE_ISSUES = [
	{
		id: "i1",
		sequence_id: 29,
		name: "Migrate Button",
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

	it("accepts legacy cycle-issue join payloads", async () => {
		server.use(
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/cycles/cyc1/cycle-issues/`,
				() =>
					HttpResponse.json({
						results: [
							{
								id: "ci1",
								issue: "i1",
								issue_detail: {
									id: "i1",
									sequence_id: 29,
									name: "Migrate Button",
								},
							},
						],
					}),
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
		expect(logs.join("\n")).toContain("Migrate Button");
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

describe("cyclesCreate", () => {
	it("creates a cycle with name only", async () => {
		let postedBody: unknown;
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/cycles/`,
				async ({ request }) => {
					postedBody = await request.json();
					return HttpResponse.json(
						{ id: "cyc-new", name: "Sprint 3", status: "draft" },
						{ status: 201 },
					);
				},
			),
		);
		const { cyclesCreateHandler } = await import("@/commands/cycles");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				cyclesCreateHandler({
					project: "ACME",
					name: "Sprint 3",
					startDate: Option.none(),
					endDate: Option.none(),
				}),
			);
		} finally {
			console.log = orig;
		}
		expect((postedBody as { name: string }).name).toBe("Sprint 3");
		expect(logs.join("\n")).toContain("Created cycle");
		expect(logs.join("\n")).toContain("cyc-new");
	});

	it("creates a cycle with dates", async () => {
		let postedBody: unknown;
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/cycles/`,
				async ({ request }) => {
					postedBody = await request.json();
					return HttpResponse.json(
						{
							id: "cyc-dated",
							name: "Sprint 4",
							start_date: "2025-06-01",
							end_date: "2025-06-14",
						},
						{ status: 201 },
					);
				},
			),
		);
		const { cyclesCreateHandler } = await import("@/commands/cycles");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				cyclesCreateHandler({
					project: "ACME",
					name: "Sprint 4",
					startDate: Option.some("2025-06-01"),
					endDate: Option.some("2025-06-14"),
				}),
			);
		} finally {
			console.log = orig;
		}
		const body = postedBody as {
			start_date?: string;
			end_date?: string;
		};
		expect(body.start_date).toBe("2025-06-01");
		expect(body.end_date).toBe("2025-06-14");
	});

	it("rejects invalid date format", async () => {
		const { cyclesCreateHandler } = await import("@/commands/cycles");
		const result = await Effect.runPromise(
			Effect.either(
				cyclesCreateHandler({
					project: "ACME",
					name: "Bad",
					startDate: Option.some("not-a-date"),
					endDate: Option.none(),
				}),
			),
		);
		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect((result.left as Error).message).toContain("YYYY-MM-DD");
		}
	});

	it("rejects invalid calendar date", async () => {
		const { cyclesCreateHandler } = await import("@/commands/cycles");
		const result = await Effect.runPromise(
			Effect.either(
				cyclesCreateHandler({
					project: "ACME",
					name: "Bad",
					startDate: Option.some("2025-02-30"),
					endDate: Option.none(),
				}),
			),
		);
		expect(result._tag).toBe("Left");
	});
});

describe("cyclesUpdate", () => {
	it("updates a cycle by name", async () => {
		let patchedBody: unknown;
		server.use(
			http.patch(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/cycles/cyc1/`,
				async ({ request }) => {
					patchedBody = await request.json();
					return HttpResponse.json({
						id: "cyc1",
						name: "Sprint 1b",
						status: "started",
					});
				},
			),
		);
		const { cyclesUpdateHandler } = await import("@/commands/cycles");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				cyclesUpdateHandler({
					project: "ACME",
					cycle: "Sprint 1",
					name: Option.some("Sprint 1b"),
					startDate: Option.none(),
					endDate: Option.none(),
				}),
			);
		} finally {
			console.log = orig;
		}
		expect((patchedBody as { name: string }).name).toBe("Sprint 1b");
		expect(logs.join("\n")).toContain("Updated cycle");
	});

	it("prints nothing-to-update when no options given", async () => {
		const { cyclesUpdateHandler } = await import("@/commands/cycles");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				cyclesUpdateHandler({
					project: "ACME",
					cycle: "Sprint 1",
					name: Option.none(),
					startDate: Option.none(),
					endDate: Option.none(),
				}),
			);
		} finally {
			console.log = orig;
		}
		expect(logs.join("\n")).toContain("Nothing to update");
	});
});

describe("cyclesDelete", () => {
	it("deletes a cycle by name", async () => {
		let deleteCalled = false;
		server.use(
			http.delete(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/cycles/cyc2/`,
				() => {
					deleteCalled = true;
					return new HttpResponse(null, { status: 204 });
				},
			),
		);
		const { cyclesDeleteHandler } = await import("@/commands/cycles");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				cyclesDeleteHandler({ project: "ACME", cycle: "Sprint 2" }),
			);
		} finally {
			console.log = orig;
		}
		expect(deleteCalled).toBe(true);
		expect(logs.join("\n")).toContain("Deleted cycle");
		expect(logs.join("\n")).toContain("Sprint 2");
	});
});

describe("cyclesList display", () => {
	it("shows stats and computed status", async () => {
		server.use(
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/cycles/`,
				() =>
					HttpResponse.json({
						results: [
							{
								id: "cyc-future",
								name: "Future Sprint",
								start_date: "2099-01-01",
								end_date: "2099-01-14",
								total_issues: 5,
								completed_issues: 0,
							},
							{
								id: "cyc-past",
								name: "Past Sprint",
								start_date: "2020-01-01",
								end_date: "2020-01-14",
								total_issues: 8,
								completed_issues: 8,
							},
							{
								id: "cyc-draft",
								name: "Draft Sprint",
								total_issues: 0,
								completed_issues: 0,
							},
						],
					}),
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
		const output = logs.join("\n");
		expect(output).toContain("upcoming");
		expect(output).toContain("completed");
		expect(output).toContain("draft");
		expect(output).toContain("[0/5]");
		expect(output).toContain("[8/8]");
	});
});
