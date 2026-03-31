import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { Command } from "@effect/cli";
import { NodeContext } from "@effect/platform-node";
import { Effect, Option } from "effect";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { _clearProjectCache } from "@/resolve";

const BASE = "http://modules-test.local";
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
const MODULES = [
	{ id: "mod1", name: "Sprint 1", status: "in_progress" },
	{ id: "mod2", name: "Sprint 2", status: "backlog" },
];
const MEMBERS = [
	{ id: "mem1", display_name: "Jane Doe", email: "jane@example.com" },
];
const MODULE_ISSUES = [
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
	http.get(`${BASE}/api/v1/workspaces/${WS}/members/`, () =>
		HttpResponse.json(MEMBERS),
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
	delete process.env.PLANE_PROJECT;
});

async function runModulesCli(argv: string[]): Promise<{ logs: string[] }> {
	const { modules } = await import("@/commands/modules");

	const root = Command.make("plane").pipe(Command.withSubcommands([modules]));
	const cli = Command.run(root, { name: "plane", version: "0.0.0" });

	const logs: string[] = [];
	const orig = console.log;
	console.log = (...args: unknown[]) => logs.push(args.join(" "));

	try {
		await Effect.runPromise(
			cli(["_", "_", ...argv]).pipe(Effect.provide(NodeContext.layer)),
		);
	} catch (error) {
		logs.push(`ERROR: ${String(error)}`);
	} finally {
		console.log = orig;
	}

	return { logs };
}

describe("modulesList", () => {
	it("lists modules for a project", async () => {
		const { modulesListHandler } = await import("@/commands/modules");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(modulesListHandler({ project: "ACME" }));
		} finally {
			console.log = orig;
		}

		const output = logs.join("\n");
		expect(output).toContain("mod1");
		expect(output).toContain("Sprint 1");
		expect(output).toContain("in_progress");
		expect(output).toContain("mod2");
		expect(output).toContain("Sprint 2");
	});

	it("shows 'No modules found' when empty", async () => {
		server.use(
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/modules/`,
				() => HttpResponse.json({ results: [] }),
			),
		);

		const { modulesListHandler } = await import("@/commands/modules");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(modulesListHandler({ project: "ACME" }));
		} finally {
			console.log = orig;
		}

		expect(logs.join("\n")).toBe("No modules found");
	});

	it("shows '?' for missing status", async () => {
		server.use(
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/modules/`,
				() =>
					HttpResponse.json({
						results: [{ id: "mod3", name: "Unstarted Sprint" }],
					}),
			),
		);

		const { modulesListHandler } = await import("@/commands/modules");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(modulesListHandler({ project: "ACME" }));
		} finally {
			console.log = orig;
		}

		expect(logs.join("\n")).toContain("?");
	});
});

describe("modulesCreate", () => {
	it("parses the public CLI entrypoint and maps create flags to the API payload", async () => {
		let postedBody: unknown;
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/modules/`,
				async ({ request }) => {
					postedBody = await request.json();
					return HttpResponse.json(
						{
							id: "mod-cli",
							name: "Design System Rollout",
							status: "in-progress",
							description: "Ship tokens and docs",
						},
						{ status: 201 },
					);
				},
			),
		);

		const { logs } = await runModulesCli([
			"modules",
			"create",
			"--name",
			"Design System Rollout",
			"--description",
			"Ship tokens and docs",
			"--status",
			"in_progress",
			"--start-date",
			"2026-04-01",
			"--target-date",
			"2026-04-30",
			"--lead",
			"Jane Doe",
			"ACME",
		]);

		expect(postedBody).toEqual({
			name: "Design System Rollout",
			description: "Ship tokens and docs",
			status: "in-progress",
			start_date: "2026-04-01",
			target_date: "2026-04-30",
			lead: "mem1",
		});
		expect(logs.join("\n")).toContain(
			"Created module: Design System Rollout (mod-cli)",
		);
	});

	it("creates a module with only a name", async () => {
		let postedBody: unknown;
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/modules/`,
				async ({ request }) => {
					postedBody = await request.json();
					return HttpResponse.json(
						{
							id: "mod3",
							name: "Sprint 3",
							status: "planned",
							identifier: "ACME",
							created_at: "2026-03-31T00:00:00Z",
						},
						{ status: 201 },
					);
				},
			),
		);

		const { modulesCreateHandler } = await import("@/commands/modules");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				modulesCreateHandler({
					project: "ACME",
					name: "Sprint 3",
					description: Option.none(),
					status: Option.none(),
					startDate: Option.none(),
					targetDate: Option.none(),
					lead: Option.none(),
				}),
			);
		} finally {
			console.log = orig;
		}

		expect(postedBody).toEqual({ name: "Sprint 3" });
		expect(logs.join("\n")).toContain("Created module: Sprint 3 (mod3)");
	});

	it("creates a module with optional fields and resolves the lead", async () => {
		let postedBody: unknown;
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/modules/`,
				async ({ request }) => {
					postedBody = await request.json();
					return HttpResponse.json(
						{
							id: "mod4",
							name: "Design System Rollout",
							status: "in-progress",
							description: "Ship tokens and docs",
						},
						{ status: 201 },
					);
				},
			),
		);

		const { modulesCreateHandler } = await import("@/commands/modules");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				modulesCreateHandler({
					project: "ACME",
					name: "Design System Rollout",
					description: Option.some("Ship tokens and docs"),
					status: Option.some("in_progress"),
					startDate: Option.some("2026-04-01"),
					targetDate: Option.some("2026-04-30"),
					lead: Option.some("Jane Doe"),
				}),
			);
		} finally {
			console.log = orig;
		}

		expect(postedBody).toEqual({
			name: "Design System Rollout",
			description: "Ship tokens and docs",
			status: "in-progress",
			start_date: "2026-04-01",
			target_date: "2026-04-30",
			lead: "mem1",
		});
		expect(logs.join("\n")).toContain(
			"Created module: Design System Rollout (mod4)",
		);
	});

	it("fails fast on invalid create dates before calling the API", async () => {
		const { modulesCreateHandler } = await import("@/commands/modules");

		await expect(
			Effect.runPromise(
				modulesCreateHandler({
					project: "ACME",
					name: "Bad Dates",
					description: Option.none(),
					status: Option.none(),
					startDate: Option.some("2026-02-31"),
					targetDate: Option.none(),
					lead: Option.none(),
				}),
			),
		).rejects.toThrow("--start-date must be a valid date in YYYY-MM-DD format");
	});
});

describe("modulesDelete", () => {
	it("deletes a module by UUID", async () => {
		let deleted = false;
		server.use(
			http.delete(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/modules/mod1/`,
				() => {
					deleted = true;
					return new HttpResponse(null, { status: 204 });
				},
			),
		);

		const { modulesDeleteHandler } = await import("@/commands/modules");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				modulesDeleteHandler({
					project: "ACME",
					module: "mod1",
				}),
			);
		} finally {
			console.log = orig;
		}

		expect(deleted).toBe(true);
		expect(logs.join("\n")).toContain("Deleted module: Sprint 1 (mod1)");
	});

	it("deletes a module by exact name", async () => {
		let deleted = false;
		server.use(
			http.delete(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/modules/mod2/`,
				() => {
					deleted = true;
					return new HttpResponse(null, { status: 204 });
				},
			),
		);

		const { modulesDeleteHandler } = await import("@/commands/modules");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				modulesDeleteHandler({
					project: "ACME",
					module: "Sprint 2",
				}),
			);
		} finally {
			console.log = orig;
		}

		expect(deleted).toBe(true);
		expect(logs.join("\n")).toContain("Deleted module: Sprint 2 (mod2)");
	});
});

describe("moduleIssuesList", () => {
	it("lists issues in a module with detail", async () => {
		const { moduleIssuesListHandler } = await import("@/commands/modules");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				moduleIssuesListHandler({
					project: "ACME",
					moduleId: "mod1",
				}),
			);
		} finally {
			console.log = orig;
		}

		const output = logs.join("\n");
		expect(output).toContain("ACME-");
		expect(output).toContain("29");
		expect(output).toContain("Migrate Button");
	});

	it("lists raw issue payloads returned by newer Plane APIs", async () => {
		server.use(
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/modules/mod1/module-issues/`,
				() =>
					HttpResponse.json({
						results: [{ id: "i1", sequence_id: 29, name: "Migrate Button" }],
					}),
			),
		);

		const { moduleIssuesListHandler } = await import("@/commands/modules");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				moduleIssuesListHandler({
					project: "ACME",
					moduleId: "mod1",
				}),
			);
		} finally {
			console.log = orig;
		}

		expect(logs.join("\n")).toContain("ACME- 29  Migrate Button");
	});

	it("falls back to issue UUID when no issue_detail", async () => {
		server.use(
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/modules/mod1/module-issues/`,
				() =>
					HttpResponse.json({ results: [{ id: "mi2", issue: "bare-uuid" }] }),
			),
		);

		const { moduleIssuesListHandler } = await import("@/commands/modules");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				moduleIssuesListHandler({
					project: "ACME",
					moduleId: "mod1",
				}),
			);
		} finally {
			console.log = orig;
		}

		expect(logs.join("\n")).toContain("bare-uuid");
	});

	it("shows 'No issues in module' when empty", async () => {
		server.use(
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/modules/mod1/module-issues/`,
				() => HttpResponse.json({ results: [] }),
			),
		);

		const { moduleIssuesListHandler } = await import("@/commands/modules");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				moduleIssuesListHandler({
					project: "ACME",
					moduleId: "mod1",
				}),
			);
		} finally {
			console.log = orig;
		}

		expect(logs.join("\n")).toBe("No issues in module");
	});
});

describe("moduleIssuesAdd", () => {
	it("adds an issue to a module", async () => {
		let postedBody: unknown;
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/modules/mod1/module-issues/`,
				async ({ request }) => {
					postedBody = await request.json();
					return HttpResponse.json({ issues: ["i1"] }, { status: 201 });
				},
			),
		);

		const { moduleIssuesAddHandler } = await import("@/commands/modules");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				moduleIssuesAddHandler({
					project: "ACME",
					moduleId: "mod1",
					ref: "ACME-29",
				}),
			);
		} finally {
			console.log = orig;
		}

		expect((postedBody as { issues?: string[] }).issues).toContain("i1");
		expect(logs.join("\n")).toContain("ACME-29");
		expect(logs.join("\n")).toContain("mod1");
	});
});

describe("moduleIssuesRemove", () => {
	it("removes a module-issue", async () => {
		let deleted = false;
		server.use(
			http.delete(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/modules/mod1/module-issues/mi1/`,
				() => {
					deleted = true;
					return new HttpResponse(null, { status: 204 });
				},
			),
		);

		const { moduleIssuesRemoveHandler } = await import("@/commands/modules");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				moduleIssuesRemoveHandler({
					project: "ACME",
					moduleId: "mod1",
					moduleIssueId: "mi1",
				}),
			);
		} finally {
			console.log = orig;
		}

		expect(deleted).toBe(true);
		expect(logs.join("\n")).toContain("mi1");
	});
});
