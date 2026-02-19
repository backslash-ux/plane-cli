import { describe, expect, it } from "bun:test";
import { Effect, Schema } from "effect";
import {
	ActivitySchema,
	ActivitiesResponseSchema,
	IssueLinkSchema,
	IssueLinksResponseSchema,
	ModuleSchema,
	ModulesResponseSchema,
	ModuleIssueSchema,
	ModuleIssuesResponseSchema,
} from "@/config";

async function decode<A, I>(
	schema: Schema.Schema<A, I>,
	data: unknown,
): Promise<A> {
	return Effect.runPromise(
		Schema.decodeUnknown(schema)(data).pipe(
			Effect.mapError((e) => new Error(String(e))),
		),
	);
}

describe("ActivitySchema", () => {
	it("decodes a full activity", async () => {
		const a = await decode(ActivitySchema, {
			id: "act1",
			actor_detail: { display_name: "Aaron" },
			field: "state",
			old_value: "Backlog",
			new_value: "In Progress",
			verb: "updated",
			created_at: "2025-01-15T10:30:00Z",
		});
		expect(a.id).toBe("act1");
		expect(a.actor_detail?.display_name).toBe("Aaron");
		expect(a.field).toBe("state");
		expect(a.old_value).toBe("Backlog");
		expect(a.new_value).toBe("In Progress");
		expect(a.created_at).toBe("2025-01-15T10:30:00Z");
	});

	it("decodes activity with null field values", async () => {
		const a = await decode(ActivitySchema, {
			id: "act2",
			field: null,
			old_value: null,
			new_value: null,
			created_at: "2025-01-15T10:30:00Z",
		});
		expect(a.field).toBeNull();
		expect(a.old_value).toBeNull();
	});

	it("decodes minimal activity (no optional fields)", async () => {
		const a = await decode(ActivitySchema, {
			id: "act3",
			created_at: "2025-01-15T10:30:00Z",
		});
		expect(a.id).toBe("act3");
	});

	it("rejects missing id", async () => {
		await expect(
			decode(ActivitySchema, { created_at: "2025-01-15T10:30:00Z" }),
		).rejects.toThrow();
	});
});

describe("ActivitiesResponseSchema", () => {
	it("decodes results array", async () => {
		const resp = await decode(ActivitiesResponseSchema, {
			results: [
				{ id: "a1", created_at: "2025-01-15T10:30:00Z" },
				{ id: "a2", created_at: "2025-01-16T10:30:00Z" },
			],
		});
		expect(resp.results).toHaveLength(2);
	});

	it("decodes empty results", async () => {
		const resp = await decode(ActivitiesResponseSchema, { results: [] });
		expect(resp.results).toHaveLength(0);
	});
});

describe("IssueLinkSchema", () => {
	it("decodes a full link", async () => {
		const l = await decode(IssueLinkSchema, {
			id: "link1",
			title: "PR #42",
			url: "https://github.com/org/repo/pull/42",
			created_at: "2025-01-15T10:30:00Z",
		});
		expect(l.id).toBe("link1");
		expect(l.title).toBe("PR #42");
		expect(l.url).toBe("https://github.com/org/repo/pull/42");
	});

	it("decodes link with null title", async () => {
		const l = await decode(IssueLinkSchema, {
			id: "link2",
			title: null,
			url: "https://example.com",
			created_at: "2025-01-15T10:30:00Z",
		});
		expect(l.title).toBeNull();
	});

	it("rejects missing url", async () => {
		await expect(
			decode(IssueLinkSchema, {
				id: "link3",
				created_at: "2025-01-15T10:30:00Z",
			}),
		).rejects.toThrow();
	});
});

describe("IssueLinksResponseSchema", () => {
	it("decodes results", async () => {
		const resp = await decode(IssueLinksResponseSchema, {
			results: [
				{
					id: "l1",
					url: "https://example.com/1",
					created_at: "2025-01-15T10:00:00Z",
				},
			],
		});
		expect(resp.results).toHaveLength(1);
	});

	it("decodes empty results", async () => {
		const resp = await decode(IssueLinksResponseSchema, { results: [] });
		expect(resp.results).toHaveLength(0);
	});
});

describe("ModuleSchema", () => {
	it("decodes a module", async () => {
		const m = await decode(ModuleSchema, { id: "mod1", name: "Sprint 1" });
		expect(m.id).toBe("mod1");
		expect(m.name).toBe("Sprint 1");
	});

	it("accepts optional status and description", async () => {
		const m = await decode(ModuleSchema, {
			id: "mod1",
			name: "Sprint 1",
			status: "in_progress",
			description: "Focus on migration",
		});
		expect(m.status).toBe("in_progress");
		expect(m.description).toBe("Focus on migration");
	});

	it("accepts null description", async () => {
		const m = await decode(ModuleSchema, {
			id: "mod1",
			name: "Sprint 1",
			description: null,
		});
		expect(m.description).toBeNull();
	});

	it("rejects missing name", async () => {
		await expect(decode(ModuleSchema, { id: "mod1" })).rejects.toThrow();
	});
});

describe("ModulesResponseSchema", () => {
	it("decodes results", async () => {
		const resp = await decode(ModulesResponseSchema, {
			results: [
				{ id: "m1", name: "Sprint 1" },
				{ id: "m2", name: "Sprint 2" },
			],
		});
		expect(resp.results).toHaveLength(2);
	});
});

describe("ModuleIssueSchema", () => {
	it("decodes a module issue with detail", async () => {
		const mi = await decode(ModuleIssueSchema, {
			id: "mi1",
			issue: "issue-uuid",
			issue_detail: {
				id: "issue-uuid",
				sequence_id: 29,
				name: "Migrate Button",
			},
		});
		expect(mi.id).toBe("mi1");
		expect(mi.issue_detail?.sequence_id).toBe(29);
	});

	it("decodes without issue_detail", async () => {
		const mi = await decode(ModuleIssueSchema, {
			id: "mi1",
			issue: "issue-uuid",
		});
		expect(mi.issue).toBe("issue-uuid");
		expect(mi.issue_detail).toBeUndefined();
	});

	it("rejects missing issue", async () => {
		await expect(decode(ModuleIssueSchema, { id: "mi1" })).rejects.toThrow();
	});
});

describe("ModuleIssuesResponseSchema", () => {
	it("decodes results", async () => {
		const resp = await decode(ModuleIssuesResponseSchema, {
			results: [{ id: "mi1", issue: "uuid1" }],
		});
		expect(resp.results).toHaveLength(1);
	});
});
