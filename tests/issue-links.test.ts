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

const BASE = "http://links-test.local";
const WS = "testws";

const PROJECTS = [
	{ id: "proj-acme", identifier: "ACME", name: "Acme Project" },
];
const ISSUES = [
	{
		id: "i1",
		sequence_id: 29,
		name: "Migrate Button",
		priority: "high",
		state: "s1",
	},
];
const LINKS = [
	{
		id: "lnk1",
		title: "PR #42",
		url: "https://github.com/org/repo/pull/42",
		created_at: "2025-01-15T10:00:00Z",
	},
	{
		id: "lnk2",
		title: null,
		url: "https://docs.example.com",
		created_at: "2025-01-14T10:00:00Z",
	},
];

const server = setupServer(
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/`, () =>
		HttpResponse.json({ results: PROJECTS }),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`, () =>
		HttpResponse.json({ results: ISSUES }),
	),
	http.get(
		`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/issue-links/`,
		() => HttpResponse.json({ results: LINKS }),
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

describe("issueLinkList", () => {
	it("lists links for an issue", async () => {
		const { issueLinkListHandler } = await import("@/commands/issue");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(issueLinkListHandler({ ref: "ACME-29" }));
		} finally {
			console.log = orig;
		}

		const output = logs.join("\n");
		expect(output).toContain("lnk1");
		expect(output).toContain("PR #42");
		expect(output).toContain("https://github.com/org/repo/pull/42");
	});

	it("shows '(no title)' for null title", async () => {
		const { issueLinkListHandler } = await import("@/commands/issue");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(issueLinkListHandler({ ref: "ACME-29" }));
		} finally {
			console.log = orig;
		}

		expect(logs.join("\n")).toContain("(no title)");
	});

	it("shows 'No links' when empty", async () => {
		server.use(
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/issue-links/`,
				() => HttpResponse.json({ results: [] }),
			),
		);

		const { issueLinkListHandler } = await import("@/commands/issue");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(issueLinkListHandler({ ref: "ACME-29" }));
		} finally {
			console.log = orig;
		}

		expect(logs.join("\n")).toBe("No links");
	});
});

describe("issueLinkAdd", () => {
	it("adds a link without title", async () => {
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/issue-links/`,
				async ({ request }) => {
					const body = (await request.json()) as { url?: string };
					return HttpResponse.json({
						id: "lnk-new",
						url: body.url,
						created_at: "2025-01-15T10:00:00Z",
					});
				},
			),
		);

		const { issueLinkAddHandler } = await import("@/commands/issue");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				issueLinkAddHandler({
					ref: "ACME-29",
					url: "https://example.com",
					title: Option.none(),
				}),
			);
		} finally {
			console.log = orig;
		}

		const output = logs.join("\n");
		expect(output).toContain("lnk-new");
		expect(output).toContain("https://example.com");
	});

	it("adds a link with title", async () => {
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/issue-links/`,
				async ({ request }) => {
					const body = (await request.json()) as {
						url?: string;
						title?: string;
					};
					return HttpResponse.json({
						id: "lnk-new2",
						title: body.title,
						url: body.url,
						created_at: "2025-01-15T10:00:00Z",
					});
				},
			),
		);

		const { issueLinkAddHandler } = await import("@/commands/issue");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				issueLinkAddHandler({
					ref: "ACME-29",
					url: "https://docs.example.com",
					title: Option.some("Design doc"),
				}),
			);
		} finally {
			console.log = orig;
		}

		expect(logs.join("\n")).toContain("lnk-new2");
	});
});

describe("issueLinkRemove", () => {
	it("removes a link", async () => {
		let deleted = false;
		server.use(
			http.delete(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/issue-links/lnk1/`,
				() => {
					deleted = true;
					return new HttpResponse(null, { status: 204 });
				},
			),
		);

		const { issueLinkRemoveHandler } = await import("@/commands/issue");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				issueLinkRemoveHandler({ ref: "ACME-29", linkId: "lnk1" }),
			);
		} finally {
			console.log = orig;
		}

		expect(deleted).toBe(true);
		expect(logs.join("\n")).toContain("lnk1");
	});
});
