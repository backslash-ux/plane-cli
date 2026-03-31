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

const BASE = "http://cw-test.local";
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
const COMMENTS = [
	{
		id: "c1",
		comment_html: "<p>Fixed in v2</p>",
		actor_detail: { display_name: "Aaron" },
		created_at: "2025-01-15T10:30:00Z",
	},
	{
		id: "c2",
		comment_html: "<p>LGTM</p>",
		actor_detail: { display_name: "Bea" },
		created_at: "2025-01-16T09:00:00Z",
	},
];
const WORKLOGS = [
	{
		id: "w1",
		description: "Code review",
		duration: 90,
		logged_by_detail: { display_name: "Aaron" },
		created_at: "2025-01-15T10:00:00Z",
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
		`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/comments/`,
		() => HttpResponse.json({ results: COMMENTS }),
	),
	http.get(
		`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/work-items/i1/worklogs/`,
		() => new HttpResponse('{"error":"Page not found."}', { status: 404 }),
	),
	http.get(
		`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/worklogs/`,
		() => HttpResponse.json({ results: WORKLOGS }),
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

describe("issueCommentsList", () => {
	it("lists comments with author and stripped HTML", async () => {
		const { issueCommentsListHandler } = await import("@/commands/issue");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(issueCommentsListHandler({ ref: "ACME-29" }));
		} finally {
			console.log = orig;
		}
		const output = logs.join("\n");
		expect(output).toContain("c1");
		expect(output).toContain("Aaron");
		expect(output).toContain("Fixed in v2");
		expect(output).not.toContain("<p>");
	});

	it("shows 'No comments' when empty", async () => {
		server.use(
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/comments/`,
				() => HttpResponse.json({ results: [] }),
			),
		);
		const { issueCommentsListHandler } = await import("@/commands/issue");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(issueCommentsListHandler({ ref: "ACME-29" }));
		} finally {
			console.log = orig;
		}
		expect(logs.join("\n")).toBe("No comments");
	});

	it("shows '?' for missing actor", async () => {
		server.use(
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/comments/`,
				() =>
					HttpResponse.json({
						results: [
							{
								id: "c3",
								comment_html: "<p>hi</p>",
								created_at: "2025-01-17T10:00:00Z",
							},
						],
					}),
			),
		);
		const { issueCommentsListHandler } = await import("@/commands/issue");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(issueCommentsListHandler({ ref: "ACME-29" }));
		} finally {
			console.log = orig;
		}
		expect(logs.join("\n")).toContain("?");
	});
});

describe("issueCommentUpdate", () => {
	it("updates a comment", async () => {
		let patchedBody: unknown;
		server.use(
			http.patch(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/comments/c1/`,
				async ({ request }) => {
					patchedBody = await request.json();
					return HttpResponse.json({
						id: "c1",
						comment_html: "<p>Updated</p>",
						created_at: "2025-01-15T10:30:00Z",
					});
				},
			),
		);
		const { issueCommentUpdateHandler } = await import("@/commands/issue");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				issueCommentUpdateHandler({
					ref: "ACME-29",
					commentId: "c1",
					text: "Updated text",
				}),
			);
		} finally {
			console.log = orig;
		}
		expect((patchedBody as { comment_html?: string }).comment_html).toContain(
			"Updated text",
		);
		expect(logs.join("\n")).toContain("c1");
		expect(logs.join("\n")).toContain("updated");
	});
});

describe("issueCommentDelete", () => {
	it("deletes a comment", async () => {
		let deleted = false;
		server.use(
			http.delete(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/comments/c1/`,
				() => {
					deleted = true;
					return new HttpResponse(null, { status: 204 });
				},
			),
		);
		const { issueCommentDeleteHandler } = await import("@/commands/issue");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				issueCommentDeleteHandler({
					ref: "ACME-29",
					commentId: "c1",
				}),
			);
		} finally {
			console.log = orig;
		}
		expect(deleted).toBe(true);
		expect(logs.join("\n")).toContain("c1");
	});
});

describe("issueWorklogsList", () => {
	it("lists worklogs with hours", async () => {
		const { issueWorklogsListHandler } = await import("@/commands/issue");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(issueWorklogsListHandler({ ref: "ACME-29" }));
		} finally {
			console.log = orig;
		}
		const output = logs.join("\n");
		expect(output).toContain("w1");
		expect(output).toContain("1.5h");
		expect(output).toContain("Aaron");
		expect(output).toContain("Code review");
	});

	it("shows 'No worklogs' when empty", async () => {
		server.use(
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/work-items/i1/worklogs/`,
				() => new HttpResponse('{"error":"Page not found."}', { status: 404 }),
			),
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/worklogs/`,
				() => HttpResponse.json({ results: [] }),
			),
		);
		const { issueWorklogsListHandler } = await import("@/commands/issue");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(issueWorklogsListHandler({ ref: "ACME-29" }));
		} finally {
			console.log = orig;
		}
		expect(logs.join("\n")).toBe("No worklogs");
	});
});

describe("issueWorklogsAdd", () => {
	it("logs time without description", async () => {
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/work-items/i1/worklogs/`,
				() => new HttpResponse('{"error":"Page not found."}', { status: 404 }),
			),
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/worklogs/`,
				async ({ request }) => {
					const body = (await request.json()) as { duration?: number };
					return HttpResponse.json({
						id: "w-new",
						duration: body.duration,
						created_at: "2025-01-15T10:00:00Z",
					});
				},
			),
		);
		const { issueWorklogsAddHandler } = await import("@/commands/issue");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				issueWorklogsAddHandler({
					ref: "ACME-29",
					duration: 60,
					description: Option.none(),
				}),
			);
		} finally {
			console.log = orig;
		}
		expect(logs.join("\n")).toContain("1.0h");
		expect(logs.join("\n")).toContain("w-new");
	});

	it("logs time with description", async () => {
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/work-items/i1/worklogs/`,
				() => new HttpResponse('{"error":"Page not found."}', { status: 404 }),
			),
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/worklogs/`,
				async ({ request }) => {
					const body = (await request.json()) as {
						duration?: number;
						description?: string;
					};
					return HttpResponse.json({
						id: "w-new2",
						duration: body.duration,
						description: body.description,
						created_at: "2025-01-15T10:00:00Z",
					});
				},
			),
		);
		const { issueWorklogsAddHandler } = await import("@/commands/issue");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(
				issueWorklogsAddHandler({
					ref: "ACME-29",
					duration: 30,
					description: Option.some("standup"),
				}),
			);
		} finally {
			console.log = orig;
		}
		expect(logs.join("\n")).toContain("0.5h");
	});

	it("handles missing logged_by_detail in worklogs list", async () => {
		server.use(
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/work-items/i1/worklogs/`,
				() => new HttpResponse('{"error":"Page not found."}', { status: 404 }),
			),
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/worklogs/`,
				() =>
					HttpResponse.json({
						results: [
							{ id: "w2", duration: 45, created_at: "2025-01-15T10:00:00Z" },
						],
					}),
			),
		);
		const { issueWorklogsListHandler } = await import("@/commands/issue");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(issueWorklogsListHandler({ ref: "ACME-29" }));
		} finally {
			console.log = orig;
		}
		expect(logs.join("\n")).toContain("?");
		expect(logs.join("\n")).toContain("0.8h");
	});
});
