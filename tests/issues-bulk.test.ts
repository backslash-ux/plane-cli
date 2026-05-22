import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Option } from "effect";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
	issuesBulkCreateHandler,
	issuesBulkUpdateHandler,
} from "@/commands/issues-bulk";
import { _clearProjectCache } from "@/resolve";

const BASE = "http://bulk-test.local";
const WS = "testws";

const server = setupServer(
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/`, () =>
		HttpResponse.json({
			results: [{ id: "proj-acme", identifier: "ACME", name: "Acme" }],
		}),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/`, () =>
		HttpResponse.json({
			id: "proj-acme",
			identifier: "ACME",
			name: "Acme",
			cycle_view: true,
			module_view: true,
			issue_views_view: true,
			page_view: true,
			inbox_view: true,
			estimate: "est-1",
		}),
	),
	http.get(
		`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/estimates/`,
		() =>
			HttpResponse.json({
				id: "est-1",
				name: "Story Points",
				type: "points",
				project: "proj-acme",
				workspace: WS,
			}),
	),
	http.get(
		`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/estimates/est-1/estimate-points/`,
		() =>
			HttpResponse.json([
				{
					id: "pt-1",
					estimate: "est-1",
					key: 1,
					value: "1",
					project: "proj-acme",
					workspace: WS,
				},
			]),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/members/`, () =>
		HttpResponse.json([
			{ id: "m-alice", display_name: "Alice", email: "alice@example.com" },
		]),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/cycles/`, () =>
		HttpResponse.json({
			results: [{ id: "cyc-1", name: "Week 1", status: "started" }],
		}),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/modules/`, () =>
		HttpResponse.json({
			results: [{ id: "mod-1", name: "Module 1", status: "planned" }],
		}),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`, () =>
		HttpResponse.json({
			results: [
				{
					id: "i1",
					sequence_id: 1,
					name: "Existing follow-up",
					priority: "medium",
					state: { id: "s-todo", name: "Todo", group: "unstarted" },
				},
			],
		}),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/states/`, () =>
		HttpResponse.json({
			results: [{ id: "s-todo", name: "Todo", group: "unstarted" }],
		}),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/labels/`, () =>
		HttpResponse.json({
			results: [{ id: "l-pre-uat", name: "pre-UAT", color: "#2563eb" }],
		}),
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

describe("issues bulk commands", () => {
	it("validates bulk-create without posting in dry-run mode", async () => {
		let posted = false;
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`,
				() => {
					posted = true;
					return HttpResponse.json({});
				},
			),
		);
		const file = await writeJson([{ title: "New audit item" }]);
		const output = await captureLogs(() =>
			issuesBulkCreateHandler({
				project: "ACME",
				file,
				dryRun: true,
				dedupe: Option.none(),
				...shared({ state: "Todo", labels: ["pre-UAT"] }),
			}),
		);
		expect(posted).toBe(false);
		expect(output).toContain("would_create New audit item");
	});

	it("reports duplicate candidates instead of creating", async () => {
		let posted = false;
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`,
				() => {
					posted = true;
					return HttpResponse.json({});
				},
			),
		);
		const file = await writeJson([{ title: "Existing follow-up" }]);
		const output = await captureLogs(() =>
			issuesBulkCreateHandler({
				project: "ACME",
				file,
				dryRun: false,
				dedupe: Option.some("title"),
				...shared(),
			}),
		);
		expect(posted).toBe(false);
		expect(output).toContain("possible_duplicate Existing follow-up");
	});

	it("creates non-duplicate bulk records", async () => {
		let body: unknown;
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`,
				async ({ request }) => {
					body = await request.json();
					return HttpResponse.json({
						id: "i-new",
						sequence_id: 22,
						name: (body as { name?: string }).name,
						priority: "urgent",
						state: "s-todo",
					});
				},
			),
		);
		const file = await writeJson([
			{ title: "Fresh follow-up", priority: "urgent" },
		]);
		const output = await captureLogs(() =>
			issuesBulkCreateHandler({
				project: "ACME",
				file,
				dryRun: false,
				dedupe: Option.none(),
				...shared(),
			}),
		);
		expect((body as { name?: string }).name).toBe("Fresh follow-up");
		expect(output).toContain("created Fresh follow-up");
	});

	it("marks bulk-create records invalid when title is missing", async () => {
		const file = await writeJson([{ priority: "urgent" }]);
		const output = await captureLogs(() =>
			issuesBulkCreateHandler({
				project: "ACME",
				file,
				dryRun: true,
				dedupe: Option.none(),
				...shared(),
			}),
		);
		expect(output).toContain("invalid item 1: title is required");
	});

	it("validates rich bulk-create fields during dry-run", async () => {
		const file = await writeJson([
			{
				title: "Rich item",
				priority: "high",
				description_html: "<p>Details</p>",
				assignee: "alice@example.com",
				labels: ["pre-UAT"],
				start_date: "2026-05-01",
				target_date: "2026-05-02",
				estimate: "pt-1",
				cycle: "Week 1",
				module: "Module 1",
			},
		]);
		const output = await captureLogs(() =>
			issuesBulkCreateHandler({
				project: "ACME",
				file,
				dryRun: true,
				dedupe: Option.none(),
				...shared(),
			}),
		);
		expect(output).toContain("would_create Rich item");
	});

	it("reports validation errors for invalid bulk-create fields", async () => {
		const file = await writeJson([
			{ title: "Bad priority", priority: "highest" },
			{ title: "Bad date", start_date: "May 1" },
			{ title: "Bad HTML", description: "<p" },
			{ title: "Bad estimate", estimate: "missing" },
		]);
		const output = await captureLogs(() =>
			issuesBulkCreateHandler({
				project: "ACME",
				file,
				dryRun: true,
				dedupe: Option.none(),
				...shared(),
			}),
		);
		expect(output).toContain("Invalid priority");
		expect(output).toContain("start_date must be YYYY-MM-DD");
		expect(output).toContain("description HTML appears malformed");
		expect(output).toContain("Estimate point not found");
	});

	it("requires ref for bulk-update records", async () => {
		const file = await writeJson([{ title: "No ref" }]);
		const output = await captureLogs(() =>
			issuesBulkUpdateHandler({
				project: "ACME",
				file,
				dryRun: true,
				...shared(),
			}),
		);
		expect(output).toContain("invalid item 1: ref is required");
	});

	it("validates malformed refs in bulk-update records", async () => {
		const file = await writeJson([{ ref: "bad-ref", title: "No ref" }]);
		const output = await captureLogs(() =>
			issuesBulkUpdateHandler({
				project: "ACME",
				file,
				dryRun: true,
				...shared(),
			}),
		);
		expect(output).toContain("Invalid issue ref");
	});

	it("plans valid bulk-update records in dry-run mode", async () => {
		const file = await writeJson([{ ref: "ACME-1", title: "Renamed" }]);
		const output = await captureLogs(() =>
			issuesBulkUpdateHandler({
				project: "ACME",
				file,
				dryRun: true,
				...shared({ state: "Todo" }),
			}),
		);
		expect(output).toContain("would_update ACME-1");
	});

	it("updates bulk records and attaches cycle/module", async () => {
		let patchedBody: unknown;
		let cycleAttached = false;
		let moduleAttached = false;
		server.use(
			http.patch(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/`,
				async ({ request }) => {
					patchedBody = await request.json();
					return HttpResponse.json({
						id: "i1",
						sequence_id: 1,
						name: (patchedBody as { name?: string }).name,
						priority: "medium",
						state: { id: "s-todo", name: "Todo", group: "unstarted" },
					});
				},
			),
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/`,
				() =>
					HttpResponse.json({
						id: "i1",
						sequence_id: 1,
						name: "Updated",
						priority: "medium",
						state: { id: "s-todo", name: "Todo", group: "unstarted" },
					}),
			),
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/cycles/cyc-1/cycle-issues/`,
				() => {
					cycleAttached = true;
					return HttpResponse.json({});
				},
			),
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/modules/mod-1/module-issues/`,
				() => {
					moduleAttached = true;
					return HttpResponse.json({});
				},
			),
		);
		const file = await writeJson([{ ref: "ACME-1", title: "Updated" }]);
		const output = await captureLogs(() =>
			issuesBulkUpdateHandler({
				project: "ACME",
				file,
				dryRun: false,
				...shared({ cycle: "Week 1", module: "Module 1" }),
			}),
		);
		expect((patchedBody as { name?: string }).name).toBe("Updated");
		expect(cycleAttached).toBe(true);
		expect(moduleAttached).toBe(true);
		expect(output).toContain("updated ACME-1");
	});
});

function shared({
	state,
	labels = [],
	cycle,
	module,
}: {
	state?: string;
	labels?: string[];
	cycle?: string;
	module?: string;
} = {}) {
	return {
		state: state ? Option.some(state) : Option.none<string>(),
		priority: Option.none<string>(),
		assignee: Option.none<string>(),
		label: labels,
		startDate: Option.none<string>(),
		targetDate: Option.none<string>(),
		estimate: Option.none<string>(),
		cycle: cycle ? Option.some(cycle) : Option.none<string>(),
		module: module ? Option.some(module) : Option.none<string>(),
	};
}

async function writeJson(value: unknown): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "plane-bulk-test-"));
	const file = join(dir, "issues.json");
	await writeFile(file, `${JSON.stringify(value)}\n`, "utf8");
	return file;
}

async function captureLogs(effectFactory: () => Effect.Effect<unknown, Error>) {
	const logs: string[] = [];
	const orig = console.log;
	console.log = (...args: unknown[]) => logs.push(args.join(" "));
	try {
		await Effect.runPromise(effectFactory());
	} finally {
		console.log = orig;
	}
	return logs.join("\n");
}
