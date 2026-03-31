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

const BASE = "http://intake-test.local";
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
	intake_view: true,
};
const INTAKE_ISSUES = [
	{
		id: "int1",
		issue: "i1",
		issue_detail: {
			id: "i1",
			sequence_id: 5,
			name: "Bug report",
			priority: "high",
		},
		status: -2,
		created_at: "2025-01-15T10:00:00Z",
	},
	{
		id: "int2",
		issue: "i2",
		issue_detail: {
			id: "i2",
			sequence_id: 6,
			name: "Feature request",
			priority: "low",
		},
		status: 1,
		created_at: "2025-01-14T10:00:00Z",
	},
	{
		id: "int3",
		issue: "i3",
		created_at: "2025-01-13T10:00:00Z",
	},
];

const server = setupServer(
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/`, () =>
		HttpResponse.json({ results: PROJECTS }),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/`, () =>
		HttpResponse.json(PROJECT_DETAIL),
	),
	http.get(
		`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/intake-issues/`,
		() => HttpResponse.json({ results: INTAKE_ISSUES }),
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

describe("intakeList", () => {
	it("lists intake issues with status labels", async () => {
		const { intakeListHandler } = await import("@/commands/intake");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(intakeListHandler({ project: "ACME" }));
		} finally {
			console.log = orig;
		}
		const output = logs.join("\n");
		expect(output).toContain("int1");
		expect(output).toContain("pending");
		expect(output).toContain("Bug report");
		expect(output).toContain("int2");
		expect(output).toContain("accepted");
	});

	it("shows 'No intake issues' when empty", async () => {
		server.use(
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/intake-issues/`,
				() => HttpResponse.json({ results: [] }),
			),
		);
		const { intakeListHandler } = await import("@/commands/intake");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(intakeListHandler({ project: "ACME" }));
		} finally {
			console.log = orig;
		}
		expect(logs.join("\n")).toBe("No intake issues");
	});

	it("handles intake issue without issue_detail", async () => {
		const { intakeListHandler } = await import("@/commands/intake");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(intakeListHandler({ project: "ACME" }));
		} finally {
			console.log = orig;
		}
		expect(logs.join("\n")).toContain("int3");
	});
});

describe("intakeAccept", () => {
	it("accepts an intake issue", async () => {
		let patchedBody: unknown;
		server.use(
			http.patch(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/intake-issues/i1/`,
				async ({ request }) => {
					patchedBody = await request.json();
					return HttpResponse.json({
						id: "int1",
						status: 1,
						created_at: "2025-01-15T10:00:00Z",
					});
				},
			),
		);
		const { intakeAcceptHandler } = await import("@/commands/intake");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				intakeAcceptHandler({ project: "ACME", intakeId: "int1" }),
			);
		} finally {
			console.log = orig;
		}
		expect((patchedBody as { status?: number }).status).toBe(1);
		expect(logs.join("\n")).toContain("accepted");
	});
});

describe("intakeReject", () => {
	it("rejects an intake issue", async () => {
		let patchedBody: unknown;
		server.use(
			http.patch(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/intake-issues/i1/`,
				async ({ request }) => {
					patchedBody = await request.json();
					return HttpResponse.json({
						id: "int1",
						status: -1,
						created_at: "2025-01-15T10:00:00Z",
					});
				},
			),
		);
		const { intakeRejectHandler } = await import("@/commands/intake");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				intakeRejectHandler({ project: "ACME", intakeId: "int1" }),
			);
		} finally {
			console.log = orig;
		}
		expect((patchedBody as { status?: number }).status).toBe(-1);
		expect(logs.join("\n")).toContain("rejected");
	});
});
