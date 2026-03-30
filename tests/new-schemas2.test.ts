import { describe, expect, it } from "bun:test";
import { Effect, Schema } from "effect";
import {
	CommentSchema,
	CommentsResponseSchema,
	CycleIssueSchema,
	CycleIssuesResponseSchema,
	IntakeIssueSchema,
	IntakeIssuesResponseSchema,
	PageSchema,
	PagesResponseSchema,
	WorklogSchema,
	WorklogsResponseSchema,
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

describe("WorklogSchema", () => {
	it("decodes a full worklog", async () => {
		const w = await decode(WorklogSchema, {
			id: "w1",
			description: "Code review",
			duration: 90,
			logged_by_detail: { display_name: "Aaron" },
			created_at: "2025-01-15T10:00:00Z",
		});
		expect(w.duration).toBe(90);
		expect(w.logged_by_detail?.display_name).toBe("Aaron");
	});

	it("decodes with null description", async () => {
		const w = await decode(WorklogSchema, {
			id: "w2",
			description: null,
			duration: 30,
			created_at: "2025-01-15T10:00:00Z",
		});
		expect(w.description).toBeNull();
	});

	it("rejects missing duration", async () => {
		await expect(
			decode(WorklogSchema, { id: "w3", created_at: "2025-01-15T10:00:00Z" }),
		).rejects.toThrow();
	});
});

describe("WorklogsResponseSchema", () => {
	it("decodes results", async () => {
		const resp = await decode(WorklogsResponseSchema, {
			results: [{ id: "w1", duration: 60, created_at: "2025-01-15T10:00:00Z" }],
		});
		expect(resp.results).toHaveLength(1);
	});

	it("decodes empty", async () => {
		const resp = await decode(WorklogsResponseSchema, { results: [] });
		expect(resp.results).toHaveLength(0);
	});
});

describe("IntakeIssueSchema", () => {
	it("decodes a full intake issue", async () => {
		const i = await decode(IntakeIssueSchema, {
			id: "int1",
			issue: "issue-uuid",
			issue_detail: {
				id: "issue-uuid",
				sequence_id: 42,
				name: "Bug report",
				priority: "high",
			},
			status: 0,
			created_at: "2025-01-15T10:00:00Z",
		});
		expect(i.status).toBe(0);
		expect(i.issue_detail?.sequence_id).toBe(42);
	});

	it("decodes minimal intake issue", async () => {
		const i = await decode(IntakeIssueSchema, {
			id: "int2",
			created_at: "2025-01-15T10:00:00Z",
		});
		expect(i.id).toBe("int2");
		expect(i.status).toBeUndefined();
	});

	it("rejects missing id", async () => {
		await expect(
			decode(IntakeIssueSchema, { created_at: "2025-01-15T10:00:00Z" }),
		).rejects.toThrow();
	});
});

describe("IntakeIssuesResponseSchema", () => {
	it("decodes results", async () => {
		const resp = await decode(IntakeIssuesResponseSchema, {
			results: [{ id: "int1", created_at: "2025-01-15T10:00:00Z" }],
		});
		expect(resp.results).toHaveLength(1);
	});
});

describe("PageSchema", () => {
	it("decodes a page", async () => {
		const p = await decode(PageSchema, {
			id: "pg1",
			name: "Architecture Overview",
			created_at: "2025-01-15T10:00:00Z",
			updated_at: "2025-01-16T10:00:00Z",
		});
		expect(p.name).toBe("Architecture Overview");
		expect(p.updated_at).toBe("2025-01-16T10:00:00Z");
	});

	it("accepts null description_html", async () => {
		const p = await decode(PageSchema, {
			id: "pg2",
			name: "Empty page",
			description_html: null,
			created_at: "2025-01-15T10:00:00Z",
		});
		expect(p.description_html).toBeNull();
	});

	it("rejects missing name", async () => {
		await expect(
			decode(PageSchema, { id: "pg3", created_at: "2025-01-15T10:00:00Z" }),
		).rejects.toThrow();
	});
});

describe("PagesResponseSchema", () => {
	it("decodes results", async () => {
		const resp = await decode(PagesResponseSchema, {
			results: [
				{ id: "pg1", name: "Arch", created_at: "2025-01-15T10:00:00Z" },
			],
		});
		expect(resp.results[0].name).toBe("Arch");
	});
});

describe("CommentSchema", () => {
	it("decodes a comment", async () => {
		const c = await decode(CommentSchema, {
			id: "c1",
			comment_html: "<p>Hello</p>",
			actor_detail: { display_name: "Aaron" },
			created_at: "2025-01-15T10:00:00Z",
		});
		expect(c.comment_html).toBe("<p>Hello</p>");
		expect(c.actor_detail?.display_name).toBe("Aaron");
	});

	it("decodes without optional fields", async () => {
		const c = await decode(CommentSchema, {
			id: "c2",
			created_at: "2025-01-15T10:00:00Z",
		});
		expect(c.id).toBe("c2");
	});

	it("rejects missing id", async () => {
		await expect(
			decode(CommentSchema, { created_at: "2025-01-15T10:00:00Z" }),
		).rejects.toThrow();
	});
});

describe("CommentsResponseSchema", () => {
	it("decodes results", async () => {
		const resp = await decode(CommentsResponseSchema, {
			results: [{ id: "c1", created_at: "2025-01-15T10:00:00Z" }],
		});
		expect(resp.results).toHaveLength(1);
	});
});

describe("CycleIssueSchema", () => {
	it("decodes with detail", async () => {
		const ci = await decode(CycleIssueSchema, {
			id: "ci1",
			issue: "i1",
			issue_detail: { id: "i1", sequence_id: 5, name: "Fix bug" },
		});
		expect(ci.issue_detail?.sequence_id).toBe(5);
	});

	it("decodes without detail", async () => {
		const ci = await decode(CycleIssueSchema, { id: "ci2", issue: "i2" });
		expect(ci.issue).toBe("i2");
	});

	it("rejects missing issue", async () => {
		await expect(decode(CycleIssueSchema, { id: "ci3" })).rejects.toThrow();
	});
});

describe("CycleIssuesResponseSchema", () => {
	it("decodes results", async () => {
		const resp = await decode(CycleIssuesResponseSchema, {
			results: [{ id: "ci1", issue: "i1" }],
		});
		expect(resp.results).toHaveLength(1);
	});
});
