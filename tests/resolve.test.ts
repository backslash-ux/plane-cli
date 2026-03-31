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
import {
	_clearProjectCache,
	findIssueBySeq,
	getMemberId,
	getStateId,
	parseIssueRef,
	resolveCycle,
	resolveProject,
} from "@/resolve";

const BASE = "http://test.local";
const WS = "testws";

const PROJECTS = [
	{ id: "proj-acme", identifier: "ACME", name: "Acme Project" },
	{ id: "proj-web", identifier: "WEB", name: "Web Project" },
];

const ISSUES = [
	{
		id: "i1",
		sequence_id: 29,
		name: "Migrate Button",
		priority: "high",
		state: "s1",
	},
	{
		id: "i2",
		sequence_id: 30,
		name: "Migrate TextInput",
		priority: "medium",
		state: "s2",
	},
];

const STATES = [
	{ id: "s-backlog", name: "Backlog", group: "backlog" },
	{ id: "s-todo", name: "Todo", group: "unstarted" },
	{ id: "s-progress", name: "In Progress", group: "started" },
	{ id: "s-done", name: "Done", group: "completed" },
];

const MEMBERS = [
	{ id: "m1", display_name: "Alice", email: "alice@example.com" },
];

const server = setupServer(
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/`, () =>
		HttpResponse.json({ results: PROJECTS }),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`, () =>
		HttpResponse.json({ results: ISSUES }),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/states/`, () =>
		HttpResponse.json({ results: STATES }),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/members/`, () =>
		HttpResponse.json(MEMBERS),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/cycles/`, () =>
		HttpResponse.json({
			results: [
				{ id: "cyc-1", name: "Sprint 1", status: "started" },
				{ id: "cyc-2", name: "Sprint 2", status: "backlog" },
			],
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
	delete process.env.PLANE_PROJECT;
});

describe("resolveProject", () => {
	it("resolves a known project identifier", async () => {
		const result = await Effect.runPromise(resolveProject("ACME"));
		expect(result.key).toBe("ACME");
		expect(result.id).toBe("proj-acme");
	});

	it("is case-insensitive", async () => {
		const result = await Effect.runPromise(resolveProject("acme"));
		expect(result.key).toBe("ACME");
	});

	it("resolves WEB too", async () => {
		const result = await Effect.runPromise(resolveProject("WEB"));
		expect(result.id).toBe("proj-web");
	});

	it("fails for unknown project", async () => {
		const result = await Effect.runPromise(
			Effect.either(resolveProject("NOPE")),
		);
		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left.message).toContain("Unknown project");
			expect(result.left.message).toContain("NOPE");
		}
	});

	it("uses the cache on second call", async () => {
		await Effect.runPromise(resolveProject("ACME"));
		// Override with empty — cache hit should prevent re-fetching
		server.use(
			http.get(`${BASE}/api/v1/workspaces/${WS}/projects/`, () =>
				HttpResponse.json({ results: [] }),
			),
		);
		const result = await Effect.runPromise(resolveProject("WEB"));
		expect(result.id).toBe("proj-web"); // still from cache
	});

	it("resolves @current from PLANE_PROJECT", async () => {
		process.env.PLANE_PROJECT = "WEB";
		const result = await Effect.runPromise(resolveProject("@current"));
		expect(result.key).toBe("WEB");
		expect(result.id).toBe("proj-web");
	});

	it("resolves blank project from PLANE_PROJECT", async () => {
		process.env.PLANE_PROJECT = "ACME";
		const result = await Effect.runPromise(resolveProject(""));
		expect(result.key).toBe("ACME");
		expect(result.id).toBe("proj-acme");
	});
});

describe("parseIssueRef", () => {
	it("parses a valid ref", async () => {
		const result = await Effect.runPromise(parseIssueRef("ACME-29"));
		expect(result.projKey).toBe("ACME");
		expect(result.seq).toBe(29);
		expect(result.projectId).toBe("proj-acme");
	});

	it("is case-insensitive", async () => {
		const result = await Effect.runPromise(parseIssueRef("acme-29"));
		expect(result.projKey).toBe("ACME");
		expect(result.seq).toBe(29);
	});

	it("fails on missing dash", async () => {
		const result = await Effect.runPromise(
			Effect.either(parseIssueRef("ACME29")),
		);
		expect(result._tag).toBe("Left");
	});

	it("fails on non-numeric sequence", async () => {
		const result = await Effect.runPromise(
			Effect.either(parseIssueRef("ACME-abc")),
		);
		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left.message).toContain("Invalid issue ref");
		}
	});

	it("fails on empty string", async () => {
		const result = await Effect.runPromise(Effect.either(parseIssueRef("")));
		expect(result._tag).toBe("Left");
	});
});

describe("findIssueBySeq", () => {
	it("finds issue by sequence_id", async () => {
		const issue = await Effect.runPromise(findIssueBySeq("proj-acme", 29));
		expect(issue.id).toBe("i1");
		expect(issue.name).toBe("Migrate Button");
	});

	it("finds second issue", async () => {
		const issue = await Effect.runPromise(findIssueBySeq("proj-acme", 30));
		expect(issue.sequence_id).toBe(30);
	});

	it("fails when issue not found", async () => {
		const result = await Effect.runPromise(
			Effect.either(findIssueBySeq("proj-acme", 999)),
		);
		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left.message).toContain("#999 not found");
		}
	});
});

describe("getStateId", () => {
	it("finds state by group name", async () => {
		const id = await Effect.runPromise(getStateId("proj-acme", "completed"));
		expect(id).toBe("s-done");
	});

	it("finds state by exact name (case-insensitive)", async () => {
		const id = await Effect.runPromise(getStateId("proj-acme", "in progress"));
		expect(id).toBe("s-progress");
	});

	it("finds backlog state", async () => {
		const id = await Effect.runPromise(getStateId("proj-acme", "backlog"));
		expect(id).toBe("s-backlog");
	});

	it("fails for unknown state", async () => {
		const result = await Effect.runPromise(
			Effect.either(getStateId("proj-acme", "nope")),
		);
		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left.message).toContain("State not found");
		}
	});
});

describe("getMemberId", () => {
	it("finds member by display name", async () => {
		const id = await Effect.runPromise(getMemberId("Alice"));
		expect(id).toBe("m1");
	});

	it("finds member by email", async () => {
		const id = await Effect.runPromise(getMemberId("alice@example.com"));
		expect(id).toBe("m1");
	});

	it("finds member by id", async () => {
		const id = await Effect.runPromise(getMemberId("m1"));
		expect(id).toBe("m1");
	});

	it("fails when member not found", async () => {
		const result = await Effect.runPromise(
			Effect.either(getMemberId("nonexistent")),
		);
		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect((result.left as Error).message).toContain(
				"Member not found: nonexistent",
			);
		}
	});
});

describe("resolveCycle", () => {
	it("finds cycle by id", async () => {
		const result = await Effect.runPromise(resolveCycle("proj-acme", "cyc-1"));
		expect(result.id).toBe("cyc-1");
		expect(result.name).toBe("Sprint 1");
	});

	it("finds cycle by name (case-insensitive)", async () => {
		const result = await Effect.runPromise(
			resolveCycle("proj-acme", "sprint 2"),
		);
		expect(result.id).toBe("cyc-2");
	});

	it("fails when cycle not found", async () => {
		const result = await Effect.runPromise(
			Effect.either(resolveCycle("proj-acme", "nonexistent")),
		);
		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect((result.left as Error).message).toContain(
				"Cycle not found: nonexistent",
			);
		}
	});
});
