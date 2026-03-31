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
import { Effect, Layer, Option } from "effect";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { _clearProjectCache } from "@/resolve";

const BASE = "http://issue-cmd-test.local";
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
	{
		id: "i2",
		sequence_id: 30,
		name: "Migrate Input",
		priority: "medium",
		state: "s2",
	},
];
const STATES = [
	{ id: "s-done", name: "Done", group: "completed" },
	{ id: "s-todo", name: "Todo", group: "unstarted" },
];

const MEMBERS = [
	{
		id: "m-alice",
		display_name: "Alice",
		email: "alice@example.com",
	},
	{ id: "m-bob", display_name: "Bob", email: "bob@example.com" },
];

const server = setupServer(
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/`, () =>
		HttpResponse.json({ results: PROJECTS }),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`, () =>
		HttpResponse.json({ results: ISSUES }),
	),
	http.get(
		`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/:issueId/`,
		({ params }) => {
			const issue = ISSUES.find((i) => i.id === params.issueId);
			if (issue) return HttpResponse.json(issue);
			return new HttpResponse(null, { status: 404 });
		},
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/states/`, () =>
		HttpResponse.json({ results: STATES }),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/labels/`, () =>
		HttpResponse.json({
			results: [{ id: "l-bug", name: "Bug", color: "#ff0000" }],
		}),
	),

	http.get(`${BASE}/api/v1/workspaces/${WS}/members/`, () =>
		HttpResponse.json(MEMBERS),
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

describe("issueGet", () => {
	it("prints full JSON for an issue", async () => {
		const { issueGetHandler } = await import("@/commands/issue");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(issueGetHandler({ ref: "ACME-29" }));
		} finally {
			console.log = orig;
		}

		const output = logs.join("\n");
		const parsed = JSON.parse(output);
		expect(parsed.id).toBe("i1");
		expect(parsed.name).toBe("Migrate Button");
	});
});

describe("issuesList", () => {
	it("filters by state group", async () => {
		server.use(
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`,
				() =>
					HttpResponse.json({
						results: [
							{
								id: "i-state-1",
								sequence_id: 1,
								name: "Done issue",
								priority: "medium",
								state: { id: "s-done", name: "Done", group: "completed" },
								assignees: ["m-alice"],
							},
							{
								id: "i-state-2",
								sequence_id: 2,
								name: "Todo issue",
								priority: "medium",
								state: { id: "s-todo", name: "Todo", group: "unstarted" },
								assignees: ["m-bob"],
							},
						],
					}),
			),
		);

		const { issuesListHandler } = await import("@/commands/issues");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				issuesListHandler({
					project: "ACME",
					state: Option.some("completed"),
					assignee: Option.none(),
					priority: Option.none(),
				}),
			);
		} finally {
			console.log = orig;
		}

		const output = logs.join("\n");
		expect(output).toContain("Done issue");
		expect(output).not.toContain("Todo issue");
	});

	it("filters by assignee (email)", async () => {
		server.use(
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`,
				() =>
					HttpResponse.json({
						results: [
							{
								id: "i-assignee-1",
								sequence_id: 3,
								name: "Alice issue",
								priority: "medium",
								state: { id: "s-done", name: "Done", group: "completed" },
								assignees: ["m-alice"],
							},
							{
								id: "i-assignee-2",
								sequence_id: 4,
								name: "Bob issue",
								priority: "medium",
								state: { id: "s-todo", name: "Todo", group: "unstarted" },
								assignees: ["m-bob"],
							},
						],
					}),
			),
		);

		const { issuesListHandler } = await import("@/commands/issues");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				issuesListHandler({
					project: "ACME",
					state: Option.none(),
					assignee: Option.some("alice@example.com"),
					priority: Option.none(),
				}),
			);
		} finally {
			console.log = orig;
		}

		const output = logs.join("\n");
		expect(output).toContain("Alice issue");
		expect(output).not.toContain("Bob issue");
	});

	it("filters by priority", async () => {
		server.use(
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`,
				() =>
					HttpResponse.json({
						results: [
							{
								id: "i-priority-1",
								sequence_id: 5,
								name: "Urgent fix",
								priority: "urgent",
								state: { id: "s-done", name: "Done", group: "completed" },
								assignees: ["m-alice"],
							},
							{
								id: "i-priority-2",
								sequence_id: 6,
								name: "Low cleanup",
								priority: "low",
								state: { id: "s-todo", name: "Todo", group: "unstarted" },
								assignees: ["m-bob"],
							},
						],
					}),
			),
		);

		const { issuesListHandler } = await import("@/commands/issues");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				issuesListHandler({
					project: "ACME",
					state: Option.none(),
					assignee: Option.none(),
					priority: Option.some("urgent"),
				}),
			);
		} finally {
			console.log = orig;
		}

		const output = logs.join("\n");
		expect(output).toContain("Urgent fix");
		expect(output).not.toContain("Low cleanup");
	});

	it("uses the saved current project when the project input is blank", async () => {
		process.env.PLANE_PROJECT = "ACME";
		const { issuesListHandler } = await import("@/commands/issues");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				issuesListHandler({
					project: "",
					state: Option.none(),
					assignee: Option.none(),
					priority: Option.none(),
				}),
			);
		} finally {
			console.log = orig;
		}

		const output = logs.join("\n");
		expect(output).toContain("ACME-");
		expect(output).toContain("Migrate Button");
	});
});

describe("issueUpdate", () => {
	it("updates state", async () => {
		server.use(
			http.patch(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/`,
				async ({ request }) => {
					const body = (await request.json()) as { state?: string };
					return HttpResponse.json({
						id: "i1",
						sequence_id: 29,
						name: "Migrate Button",
						priority: "high",
						state: body.state ?? "s1",
					});
				},
			),
		);

		const { issueUpdateHandler } = await import("@/commands/issue");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				issueUpdateHandler({
					ref: "ACME-29",
					state: Option.some("completed"),
					priority: Option.none(),
					title: Option.none(),
					description: Option.none(),
					assignee: Option.none(),
					label: Option.none(),
					noAssignee: false,
				}),
			);
		} finally {
			console.log = orig;
		}

		expect(logs.join("\n")).toContain("Updated ACME-29");
	});

	it("updates priority", async () => {
		server.use(
			http.patch(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/`,
				async ({ request }) => {
					const body = (await request.json()) as { priority?: string };
					return HttpResponse.json({
						id: "i1",
						sequence_id: 29,
						name: "Migrate Button",
						priority: body.priority,
						state: "s1",
					});
				},
			),
			http.get(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/`,
				() =>
					HttpResponse.json({
						id: "i1",
						sequence_id: 29,
						name: "Migrate Button",
						priority: "urgent",
						state: "s1",
					}),
			),
		);

		const { issueUpdateHandler } = await import("@/commands/issue");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				issueUpdateHandler({
					ref: "ACME-29",
					state: Option.none(),
					priority: Option.some("urgent"),
					title: Option.none(),
					description: Option.none(),
					assignee: Option.none(),
					label: Option.none(),
					noAssignee: false,
				}),
			);
		} finally {
			console.log = orig;
		}

		expect(logs.join("\n")).toContain("urgent");
	});

	it("fails when nothing to update", async () => {
		const { issueUpdateHandler } = await import("@/commands/issue");
		const result = await Effect.runPromise(
			Effect.either(
				issueUpdateHandler({
					ref: "ACME-29",
					state: Option.none(),
					priority: Option.none(),
					title: Option.none(),
					description: Option.none(),
					assignee: Option.none(),
					label: Option.none(),
					noAssignee: false,
				}),
			),
		);
		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect((result.left as Error).message).toContain("Nothing to update");
		}
	});

	it("updates title", async () => {
		let patchedBody: unknown;
		server.use(
			http.patch(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/`,
				async ({ request }) => {
					patchedBody = await request.json();
					return HttpResponse.json({
						id: "i1",
						sequence_id: 29,
						name: "New title",
						priority: "high",
						state: "s1",
					});
				},
			),
		);

		const { issueUpdateHandler } = await import("@/commands/issue");
		await Effect.runPromise(
			issueUpdateHandler({
				ref: "ACME-29",
				state: Option.none(),
				priority: Option.none(),
				title: Option.some("New title"),
				description: Option.none(),
				assignee: Option.none(),
				label: Option.none(),
				noAssignee: false,
			}),
		);

		expect((patchedBody as { name?: string }).name).toBe("New title");
	});
});

describe("issueComment", () => {
	it("adds a comment", async () => {
		let postedBody: unknown;
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/comments/`,
				async ({ request }) => {
					postedBody = await request.json();
					return HttpResponse.json({ id: "c1" }, { status: 201 });
				},
			),
		);

		const { issueCommentHandler } = await import("@/commands/issue");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				issueCommentHandler({
					ref: "ACME-29",
					text: "Fixed in latest build",
				}),
			);
		} finally {
			console.log = orig;
		}

		expect((postedBody as { comment_html?: string }).comment_html).toContain(
			"Fixed in latest build",
		);
		expect(logs.join("\n")).toContain("Comment added to ACME-29");
	});

	it("HTML-escapes angle brackets in comment text", async () => {
		let postedBody: unknown;
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/comments/`,
				async ({ request }) => {
					postedBody = await request.json();
					return HttpResponse.json({ id: "c2" }, { status: 201 });
				},
			),
		);

		const { issueCommentHandler } = await import("@/commands/issue");
		try {
			await Effect.runPromise(
				issueCommentHandler({
					ref: "ACME-29",
					text: "<script>alert(1)</script>",
				}),
			);
		} finally {
		}

		expect((postedBody as { comment_html?: string }).comment_html).toContain(
			"&lt;script&gt;",
		);
		expect(
			(postedBody as { comment_html?: string }).comment_html,
		).not.toContain("<script>");
	});
});

describe("issueCreate", () => {
	it("creates an issue with just a title", async () => {
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`,
				async ({ request }) => {
					const body = (await request.json()) as { name?: string };
					return HttpResponse.json({
						id: "new-i",
						sequence_id: 99,
						name: body.name,
						priority: "none",
						state: "s1",
					});
				},
			),
		);

		const { issueCreateHandler } = await import("@/commands/issue");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				issueCreateHandler({
					project: "ACME",
					title: "New issue",
					priority: Option.none(),
					state: Option.none(),
					description: Option.none(),
					assignee: Option.none(),
					label: Option.none(),
				}),
			);
		} finally {
			console.log = orig;
		}

		expect(logs.join("\n")).toContain("ACME-99");
		expect(logs.join("\n")).toContain("New issue");
	});

	it("creates an issue with priority and state", async () => {
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`,
				async ({ request }) => {
					const body = (await request.json()) as {
						name?: string;
						priority?: string;
						state?: string;
					};
					return HttpResponse.json({
						id: "new-i2",
						sequence_id: 100,
						name: body.name,
						priority: body.priority,
						state: body.state ?? "s1",
					});
				},
			),
		);

		const { issueCreateHandler } = await import("@/commands/issue");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				issueCreateHandler({
					project: "ACME",
					title: "High priority issue",
					priority: Option.some("high"),
					state: Option.some("completed"),
					description: Option.none(),
					assignee: Option.none(),
					label: Option.none(),
				}),
			);
		} finally {
			console.log = orig;
		}

		expect(logs.join("\n")).toContain("ACME-100");
	});
});

describe("issueCreate description", () => {
	it("creates an issue with a description", async () => {
		let postedBody: unknown;
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`,
				async ({ request }) => {
					postedBody = await request.json();
					return HttpResponse.json({
						id: "new-i3",
						sequence_id: 101,
						name: (postedBody as { name?: string }).name,
						priority: "none",
						state: "s1",
					});
				},
			),
		);

		const { issueCreateHandler } = await import("@/commands/issue");
		await Effect.runPromise(
			issueCreateHandler({
				project: "ACME",
				title: "Issue with description",
				priority: Option.none(),
				state: Option.none(),
				description: Option.some("Some context here"),
				assignee: Option.none(),
				label: Option.none(),
			}),
		);

		expect((postedBody as { description_html?: string }).description_html).toBe(
			"Some context here",
		);
	});

	it("passes raw HTML description as-is", async () => {
		let postedBody: unknown;
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`,
				async ({ request }) => {
					postedBody = await request.json();
					return HttpResponse.json({
						id: "new-i4",
						sequence_id: 102,
						name: (postedBody as { name?: string }).name,
						priority: "none",
						state: "s1",
					});
				},
			),
		);

		const { issueCreateHandler } = await import("@/commands/issue");
		await Effect.runPromise(
			issueCreateHandler({
				project: "ACME",
				title: "HTML test",
				priority: Option.none(),
				state: Option.none(),
				description: Option.some("<p>Raw <b>HTML</b></p>"),
				assignee: Option.none(),
				label: Option.none(),
			}),
		);

		expect((postedBody as { description_html?: string }).description_html).toBe(
			"<p>Raw <b>HTML</b></p>",
		);
	});
});

describe("issueUpdate description", () => {
	it("updates description", async () => {
		let patchedBody: unknown;
		server.use(
			http.patch(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/`,
				async ({ request }) => {
					patchedBody = await request.json();
					return HttpResponse.json({
						id: "i1",
						sequence_id: 29,
						name: "Migrate Button",
						priority: "high",
						state: "s1",
					});
				},
			),
		);

		const { issueUpdateHandler } = await import("@/commands/issue");
		await Effect.runPromise(
			issueUpdateHandler({
				ref: "ACME-29",
				state: Option.none(),
				priority: Option.none(),
				title: Option.none(),
				description: Option.some("Updated description"),
				assignee: Option.none(),
				label: Option.none(),
				noAssignee: false,
			}),
		);

		expect(
			(patchedBody as { description_html?: string }).description_html,
		).toBe("Updated description");
	});

	it("passes raw HTML as-is in update description", async () => {
		let patchedBody: unknown;
		server.use(
			http.patch(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/`,
				async ({ request }) => {
					patchedBody = await request.json();
					return HttpResponse.json({
						id: "i1",
						sequence_id: 29,
						name: "Migrate Button",
						priority: "high",
						state: "s1",
					});
				},
			),
		);

		const { issueUpdateHandler } = await import("@/commands/issue");
		await Effect.runPromise(
			issueUpdateHandler({
				ref: "ACME-29",
				state: Option.none(),
				priority: Option.none(),
				title: Option.none(),
				description: Option.some("<b>bold</b>"),
				assignee: Option.none(),
				label: Option.none(),
				noAssignee: false,
			}),
		);

		expect(
			(patchedBody as { description_html?: string }).description_html,
		).toBe("<b>bold</b>");
	});
});

describe("issueUpdate assignee", () => {
	it("sets assignee by display name", async () => {
		let patchedBody: unknown;
		server.use(
			http.patch(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/`,
				async ({ request }) => {
					patchedBody = await request.json();
					return HttpResponse.json({
						id: "i1",
						sequence_id: 29,
						name: "Migrate Button",
						priority: "high",
						state: "s1",
					});
				},
			),
		);

		const { issueUpdateHandler } = await import("@/commands/issue");
		await Effect.runPromise(
			issueUpdateHandler({
				ref: "ACME-29",
				state: Option.none(),
				priority: Option.none(),
				title: Option.none(),
				description: Option.none(),
				assignee: Option.some("Alice"),
				label: Option.none(),
				noAssignee: false,
			}),
		);

		expect((patchedBody as { assignees?: string[] }).assignees).toEqual([
			"m-alice",
		]);
	});

	it("clears assignees with --no-assignee", async () => {
		let patchedBody: unknown;
		server.use(
			http.patch(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/`,
				async ({ request }) => {
					patchedBody = await request.json();
					return HttpResponse.json({
						id: "i1",
						sequence_id: 29,
						name: "Migrate Button",
						priority: "high",
						state: "s1",
					});
				},
			),
		);

		const { issueUpdateHandler } = await import("@/commands/issue");
		await Effect.runPromise(
			issueUpdateHandler({
				ref: "ACME-29",
				state: Option.none(),
				priority: Option.none(),
				title: Option.none(),
				description: Option.none(),
				assignee: Option.none(),
				label: Option.none(),
				noAssignee: true,
			}),
		);

		expect((patchedBody as { assignees?: string[] }).assignees).toEqual([]);
	});

	it("resolves assignee by email", async () => {
		let patchedBody: unknown;
		server.use(
			http.patch(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/`,
				async ({ request }) => {
					patchedBody = await request.json();
					return HttpResponse.json({
						id: "i1",
						sequence_id: 29,
						name: "Migrate Button",
						priority: "high",
						state: "s1",
					});
				},
			),
		);

		const { issueUpdateHandler } = await import("@/commands/issue");
		await Effect.runPromise(
			issueUpdateHandler({
				ref: "ACME-29",
				state: Option.none(),
				priority: Option.none(),
				title: Option.none(),
				description: Option.none(),
				assignee: Option.some("bob@example.com"),
				label: Option.none(),
				noAssignee: false,
			}),
		);

		expect((patchedBody as { assignees?: string[] }).assignees).toEqual([
			"m-bob",
		]);
	});
});

describe("issueCreate assignee", () => {
	it("sets assignee by display name on create", async () => {
		let postedBody: unknown;
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`,
				async ({ request }) => {
					postedBody = await request.json();
					return HttpResponse.json({
						id: "new-assignee",
						sequence_id: 300,
						name: (postedBody as { name?: string }).name,
						priority: "none",
						state: "s1",
					});
				},
			),
		);

		const { issueCreateHandler } = await import("@/commands/issue");
		await Effect.runPromise(
			issueCreateHandler({
				project: "ACME",
				title: "Assigned issue",
				priority: Option.none(),
				state: Option.none(),
				description: Option.none(),
				assignee: Option.some("Alice"),
				label: Option.none(),
			}),
		);

		expect((postedBody as { assignees?: string[] }).assignees).toEqual([
			"m-alice",
		]);
	});
});

describe("issueUpdate label", () => {
	it("sets label by name", async () => {
		let patchedBody: unknown;
		server.use(
			http.patch(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/`,
				async ({ request }) => {
					patchedBody = await request.json();
					return HttpResponse.json({
						id: "i1",
						sequence_id: 29,
						name: "Migrate Button",
						priority: "high",
						state: "s1",
					});
				},
			),
		);

		const { issueUpdateHandler } = await import("@/commands/issue");
		await Effect.runPromise(
			issueUpdateHandler({
				ref: "ACME-29",
				state: Option.none(),
				priority: Option.none(),
				title: Option.none(),
				description: Option.none(),
				assignee: Option.none(),
				label: Option.some("bug"),
				noAssignee: false,
			}),
		);

		expect((patchedBody as { label_ids?: string[] }).label_ids).toEqual([
			"l-bug",
		]);
	});
});

describe("issueCreate label", () => {
	it("sets label on create", async () => {
		let postedBody: unknown;
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`,
				async ({ request }) => {
					postedBody = await request.json();
					return HttpResponse.json({
						id: "new-label",
						sequence_id: 301,
						name: (postedBody as { name?: string }).name,
						priority: "none",
						state: "s1",
					});
				},
			),
		);

		const { issueCreateHandler } = await import("@/commands/issue");
		await Effect.runPromise(
			issueCreateHandler({
				project: "ACME",
				title: "Labeled issue",
				priority: Option.none(),
				state: Option.none(),
				description: Option.none(),
				assignee: Option.none(),
				label: Option.some("Bug"),
			}),
		);

		expect((postedBody as { label_ids?: string[] }).label_ids).toEqual([
			"l-bug",
		]);
	});
});

describe("issueDelete", () => {
	it("deletes an issue", async () => {
		let deleted = false;
		server.use(
			http.delete(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/`,
				() => {
					deleted = true;
					return new HttpResponse(null, { status: 204 });
				},
			),
		);

		const { issueDeleteHandler } = await import("@/commands/issue");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(issueDeleteHandler({ ref: "ACME-29" }));
		} finally {
			console.log = orig;
		}

		expect(deleted).toBe(true);
		expect(logs.join("\n")).toContain("Deleted ACME-29");
	});
});

describe("--description argv parsing", () => {
	async function runCli(argv: string[]): Promise<{ logs: string[] }> {
		const { issue } = await import("@/commands/issue");

		// Build a minimal root command with just the issue subcommand
		const root = Command.make("plane").pipe(Command.withSubcommands([issue]));
		const cli = Command.run(root, { name: "plane", version: "0.0.0" });

		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			// @effect/cli drops the first 2 args as [runtime, script], so prefix with two dummy tokens
			// prefixCommand then adds "plane", so the full parsed args become ["plane", ...argv]
			await Effect.runPromise(
				cli(["_", "_", ...argv]).pipe(
					Effect.provide(Layer.mergeAll(NodeContext.layer)),
				),
			);
		} catch (e) {
			logs.push(`ERROR: ${String(e)}`);
		} finally {
			console.log = orig;
		}

		return { logs };
	}

	it("issue create passes --description to API", async () => {
		let postedBody: unknown;
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`,
				async ({ request }) => {
					postedBody = await request.json();
					return HttpResponse.json({
						id: "argv-i1",
						sequence_id: 200,
						name: (postedBody as { name?: string }).name,
						priority: "none",
						state: "s1",
					});
				},
			),
		);

		const { logs } = await runCli([
			"issue",
			"create",
			"--description",
			"Hello world",
			"ACME",
			"Argv test issue",
		]);
		expect(logs.join("\n")).toContain("Created");
		expect((postedBody as { description_html?: string }).description_html).toBe(
			"Hello world",
		);
	});

	it("issue create passes raw HTML description via argv", async () => {
		let postedBody: unknown;
		server.use(
			http.post(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`,
				async ({ request }) => {
					postedBody = await request.json();
					return HttpResponse.json({
						id: "argv-i2",
						sequence_id: 201,
						name: (postedBody as { name?: string }).name,
						priority: "none",
						state: "s1",
					});
				},
			),
		);

		await runCli([
			"issue",
			"create",
			"--description",
			"<p>Raw HTML</p>",
			"ACME",
			"HTML test",
		]);
		expect((postedBody as { description_html?: string }).description_html).toBe(
			"<p>Raw HTML</p>",
		);
	});

	it("issue update passes --description to API via argv", async () => {
		let patchedBody: unknown;
		server.use(
			http.patch(
				`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/`,
				async ({ request }) => {
					patchedBody = await request.json();
					return HttpResponse.json({
						id: "i1",
						sequence_id: 29,
						name: "Migrate Button",
						priority: "high",
						state: "s1",
					});
				},
			),
		);

		await runCli(["issue", "update", "--description", "New desc", "ACME-29"]);
		expect(
			(patchedBody as { description_html?: string }).description_html,
		).toBe("New desc");
	});
});
