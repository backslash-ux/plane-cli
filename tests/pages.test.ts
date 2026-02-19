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
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { _clearProjectCache } from "@/resolve";

const BASE = "http://pages-test.local";
const WS = "testws";

const PROJECTS = [
	{ id: "proj-acme", identifier: "ACME", name: "Acme Project" },
];
const PAGES = [
	{
		id: "pg1",
		name: "Architecture Overview",
		description_html: "<p>Our architecture...</p>",
		created_at: "2025-01-10T10:00:00Z",
		updated_at: "2025-01-15T10:00:00Z",
	},
	{
		id: "pg2",
		name: "Migration Guide",
		description_html: null,
		created_at: "2025-01-05T10:00:00Z",
	},
];

const server = setupServer(
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/`, () =>
		HttpResponse.json({ results: PROJECTS }),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/pages/`, () =>
		HttpResponse.json({ results: PAGES }),
	),
	http.get(
		`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/pages/pg1/`,
		() => HttpResponse.json(PAGES[0]),
	),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

beforeEach(() => {
	_clearProjectCache();
	process.env["PLANE_HOST"] = BASE;
	process.env["PLANE_WORKSPACE"] = WS;
	process.env["PLANE_API_TOKEN"] = "test-token";
});

afterEach(() => {
	server.resetHandlers();
	delete process.env["PLANE_HOST"];
	delete process.env["PLANE_WORKSPACE"];
	delete process.env["PLANE_API_TOKEN"];
});

describe("pagesList", () => {
	it("lists pages with updated date and name", async () => {
		const { pagesListHandler } = await import("@/commands/pages");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(pagesListHandler({ project: "ACME" }));
		} finally {
			console.log = orig;
		}
		const output = logs.join("\n");
		expect(output).toContain("pg1");
		expect(output).toContain("2025-01-15");
		expect(output).toContain("Architecture Overview");
		expect(output).toContain("pg2");
		expect(output).toContain("Migration Guide");
	});

	it("falls back to created_at when no updated_at", async () => {
		const { pagesListHandler } = await import("@/commands/pages");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(pagesListHandler({ project: "ACME" }));
		} finally {
			console.log = orig;
		}
		// pg2 has no updated_at, should use created_at
		expect(logs.join("\n")).toContain("2025-01-05");
	});

	it("shows 'No pages' when empty", async () => {
		server.use(
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/pages/`,
				() => HttpResponse.json({ results: [] }),
			),
		);
		const { pagesListHandler } = await import("@/commands/pages");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(pagesListHandler({ project: "ACME" }));
		} finally {
			console.log = orig;
		}
		expect(logs.join("\n")).toBe("No pages");
	});
});

describe("pagesGet", () => {
	it("prints full JSON for a page", async () => {
		const { pagesGetHandler } = await import("@/commands/pages");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				pagesGetHandler({ project: "ACME", pageId: "pg1" }),
			);
		} finally {
			console.log = orig;
		}
		const parsed = JSON.parse(logs.join("\n"));
		expect(parsed.id).toBe("pg1");
		expect(parsed.name).toBe("Architecture Overview");
		expect(parsed.description_html).toContain("architecture");
	});
});
