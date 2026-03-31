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

const BASE = "http://pages-test.local";
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

const NEW_PAGE = {
	id: "pg-new",
	name: "New Page",
	description_html: null,
	created_at: "2025-02-01T10:00:00Z",
	updated_at: "2025-02-01T10:00:00Z",
};

const server = setupServer(
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/`, () =>
		HttpResponse.json({ results: PROJECTS }),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/`, () =>
		HttpResponse.json(PROJECT_DETAIL),
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

	it("returns a definitive error when the page API is unavailable", async () => {
		server.use(
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/pages/`,
				() => new HttpResponse('{"error":"Page not found."}', { status: 404 }),
			),
		);
		const { pagesListHandler } = await import("@/commands/pages");
		await expect(
			Effect.runPromise(pagesListHandler({ project: "ACME" })),
		).rejects.toThrow(
			"Project pages are not available for ACME on this Plane instance or API version.",
		);
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

describe("pagesCreate", () => {
	it("creates a page and logs confirmation", async () => {
		let postedBody: unknown;
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/pages/`,
				async ({ request }) => {
					postedBody = await request.json();
					return HttpResponse.json(NEW_PAGE);
				},
			),
		);
		const { pagesCreateHandler } = await import("@/commands/pages");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				pagesCreateHandler({
					project: "ACME",
					name: "New Page",
					description: Option.none(),
				}),
			);
		} finally {
			console.log = orig;
		}
		expect((postedBody as { name?: string }).name).toBe("New Page");
		expect(logs.join("\n")).toContain("Created page pg-new");
	});

	it("sends description_html when provided", async () => {
		let postedBody: unknown;
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/pages/`,
				async ({ request }) => {
					postedBody = await request.json();
					return HttpResponse.json(NEW_PAGE);
				},
			),
		);
		const { pagesCreateHandler } = await import("@/commands/pages");
		await Effect.runPromise(
			pagesCreateHandler({
				project: "ACME",
				name: "New Page",
				description: Option.some("<p>Hello</p>"),
			}),
		);
		expect((postedBody as { description_html?: string }).description_html).toBe(
			"<p>Hello</p>",
		);
	});
});

describe("pagesUpdate", () => {
	it("updates a page name", async () => {
		let patchedBody: unknown;
		server.use(
			http.patch(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/pages/pg1/`,
				async ({ request }) => {
					patchedBody = await request.json();
					return HttpResponse.json({ ...PAGES[0], name: "Updated Name" });
				},
			),
		);
		const { pagesUpdateHandler } = await import("@/commands/pages");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				pagesUpdateHandler({
					project: "ACME",
					pageId: "pg1",
					name: Option.some("Updated Name"),
					description: Option.none(),
				}),
			);
		} finally {
			console.log = orig;
		}
		expect((patchedBody as { name?: string }).name).toBe("Updated Name");
		expect(logs.join("\n")).toContain("Updated page");
	});

	it("fails when no options provided", async () => {
		const { pagesUpdateHandler } = await import("@/commands/pages");
		await expect(
			Effect.runPromise(
				pagesUpdateHandler({
					project: "ACME",
					pageId: "pg1",
					name: Option.none(),
					description: Option.none(),
				}),
			),
		).rejects.toThrow("provide at least --name or --description");
	});
});

describe("pagesDelete", () => {
	it("deletes a page and logs confirmation", async () => {
		server.use(
			http.delete(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/pages/pg1/`,
				() => new HttpResponse(null, { status: 204 }),
			),
		);
		const { pagesDeleteHandler } = await import("@/commands/pages");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				pagesDeleteHandler({ project: "ACME", pageId: "pg1" }),
			);
		} finally {
			console.log = orig;
		}
		expect(logs.join("\n")).toContain("Deleted page pg1");
	});
});

describe("pagesArchive / pagesUnarchive", () => {
	it("archives a page", async () => {
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/pages/pg1/archive/`,
				() => new HttpResponse(null, { status: 204 }),
			),
		);
		const { pagesArchiveHandler } = await import("@/commands/pages");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				pagesArchiveHandler({ project: "ACME", pageId: "pg1" }),
			);
		} finally {
			console.log = orig;
		}
		expect(logs.join("\n")).toContain("Archived page pg1");
	});

	it("unarchives a page", async () => {
		server.use(
			http.delete(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/pages/pg1/archive/`,
				() => new HttpResponse(null, { status: 204 }),
			),
		);
		const { pagesUnarchiveHandler } = await import("@/commands/pages");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				pagesUnarchiveHandler({ project: "ACME", pageId: "pg1" }),
			);
		} finally {
			console.log = orig;
		}
		expect(logs.join("\n")).toContain("Unarchived page pg1");
	});
});

describe("pagesLock / pagesUnlock", () => {
	it("locks a page", async () => {
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/pages/pg1/lock/`,
				() => new HttpResponse(null, { status: 204 }),
			),
		);
		const { pagesLockHandler } = await import("@/commands/pages");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				pagesLockHandler({ project: "ACME", pageId: "pg1" }),
			);
		} finally {
			console.log = orig;
		}
		expect(logs.join("\n")).toContain("Locked page pg1");
	});

	it("unlocks a page", async () => {
		server.use(
			http.delete(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/pages/pg1/lock/`,
				() => new HttpResponse(null, { status: 204 }),
			),
		);
		const { pagesUnlockHandler } = await import("@/commands/pages");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				pagesUnlockHandler({ project: "ACME", pageId: "pg1" }),
			);
		} finally {
			console.log = orig;
		}
		expect(logs.join("\n")).toContain("Unlocked page pg1");
	});
});

describe("pagesDuplicate", () => {
	it("duplicates a page and logs confirmation", async () => {
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/pages/pg1/duplicate/`,
				() =>
					HttpResponse.json({
						...NEW_PAGE,
						id: "pg-dup",
						name: "New Page (copy)",
					}),
			),
		);
		const { pagesDuplicateHandler } = await import("@/commands/pages");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				pagesDuplicateHandler({ project: "ACME", pageId: "pg1" }),
			);
		} finally {
			console.log = orig;
		}
		expect(logs.join("\n")).toContain("Duplicated page pg-dup");
	});
});
