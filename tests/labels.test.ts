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

const BASE = "http://labels-test.local";
const WS = "testws";

const PROJECTS = [
	{ id: "proj-acme", identifier: "ACME", name: "Acme Project" },
];
const LABELS = [
	{ id: "l-bug", name: "bug", color: "#ff0000" },
	{ id: "l-ready", name: "ready", color: "#00ff00" },
];

const server = setupServer(
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/`, () =>
		HttpResponse.json({ results: PROJECTS }),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/labels/`, () =>
		HttpResponse.json({ results: LABELS }),
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

describe("labelsDelete", () => {
	it("deletes a label by exact name", async () => {
		let deleted = false;
		server.use(
			http.delete(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/labels/l-bug/`,
				() => {
					deleted = true;
					return new HttpResponse(null, { status: 204 });
				},
			),
		);

		const { labelsDeleteHandler } = await import("@/commands/labels");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				labelsDeleteHandler({ project: "ACME", label: "bug" }),
			);
		} finally {
			console.log = orig;
		}

		expect(deleted).toBe(true);
		expect(logs.join("\n")).toContain("Deleted label: bug (l-bug)");
	});

	it("deletes a label by UUID", async () => {
		let deleted = false;
		server.use(
			http.delete(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/labels/l-ready/`,
				() => {
					deleted = true;
					return new HttpResponse(null, { status: 204 });
				},
			),
		);

		const { labelsDeleteHandler } = await import("@/commands/labels");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				labelsDeleteHandler({ project: "ACME", label: "l-ready" }),
			);
		} finally {
			console.log = orig;
		}

		expect(deleted).toBe(true);
		expect(logs.join("\n")).toContain("Deleted label: ready (l-ready)");
	});
});

describe("labelsList", () => {
	it("lists labels for a project", async () => {
		const { labelsListHandler } = await import("@/commands/labels");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(labelsListHandler({ project: "ACME" }));
		} finally {
			console.log = orig;
		}

		const output = logs.join("\n");
		expect(output).toContain("l-bug");
		expect(output).toContain("bug");
		expect(output).toContain("l-ready");
	});

	it("shows 'No labels found' when empty", async () => {
		server.use(
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/labels/`,
				() => HttpResponse.json({ results: [] }),
			),
		);

		const { labelsListHandler } = await import("@/commands/labels");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(labelsListHandler({ project: "ACME" }));
		} finally {
			console.log = orig;
		}

		expect(logs.join("\n")).toBe("No labels found");
	});
});

describe("labelsCreate", () => {
	it("creates a label with color", async () => {
		let postedBody: unknown;
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/labels/`,
				async ({ request }) => {
					postedBody = await request.json();
					return HttpResponse.json(
						{ id: "l-new", name: "critical", color: "#ff0000" },
						{ status: 201 },
					);
				},
			),
		);

		const { labelsCreateHandler } = await import("@/commands/labels");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				labelsCreateHandler({
					project: "ACME",
					name: "critical",
					color: Option.some("#ff0000"),
				}),
			);
		} finally {
			console.log = orig;
		}

		expect((postedBody as { name?: string; color?: string }).name).toBe(
			"critical",
		);
		expect((postedBody as { name?: string; color?: string }).color).toBe(
			"#ff0000",
		);
		expect(logs.join("\n")).toContain("Created label: critical (l-new)");
	});
});
