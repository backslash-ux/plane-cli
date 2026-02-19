import { describe, expect, it } from "bun:test"
import { Effect, Schema } from "effect"
import {
  StateSchema,
  IssueSchema,
  IssuesResponseSchema,
  StatesResponseSchema,
  ProjectSchema,
  ProjectsResponseSchema,
  LabelSchema,
  LabelsResponseSchema,
  MemberSchema,
  MembersResponseSchema,
  CycleSchema,
  CyclesResponseSchema,
} from "@/config"

async function decode<A, I>(schema: Schema.Schema<A, I>, data: unknown): Promise<A> {
  return Effect.runPromise(
    Schema.decodeUnknown(schema)(data).pipe(Effect.mapError((e) => new Error(String(e)))),
  )
}

describe("StateSchema", () => {
  it("decodes a valid state", async () => {
    const state = await decode(StateSchema, { id: "s1", name: "In Progress", group: "started" })
    expect(state.id).toBe("s1")
    expect(state.group).toBe("started")
  })

  it("accepts optional color", async () => {
    const state = await decode(StateSchema, {
      id: "s1",
      name: "Done",
      group: "completed",
      color: "#00ff00",
    })
    expect(state.color).toBe("#00ff00")
  })

  it("rejects missing required fields", async () => {
    await expect(decode(StateSchema, { id: "s1" })).rejects.toThrow()
  })
})

describe("IssueSchema", () => {
  const base = {
    id: "i1",
    sequence_id: 42,
    name: "Fix bug",
    priority: "high",
    state: "uuid-state",
  }

  it("decodes with string state", async () => {
    const issue = await decode(IssueSchema, base)
    expect(issue.sequence_id).toBe(42)
    expect(issue.state).toBe("uuid-state")
  })

  it("decodes with object state", async () => {
    const issue = await decode(IssueSchema, {
      ...base,
      state: { id: "s1", name: "In Progress", group: "started" },
    })
    expect(typeof issue.state).toBe("object")
  })

  it("accepts null description_html", async () => {
    const issue = await decode(IssueSchema, { ...base, description_html: null })
    expect(issue.description_html).toBeNull()
  })

  it("rejects missing name", async () => {
    await expect(decode(IssueSchema, { ...base, name: undefined })).rejects.toThrow()
  })
})

describe("IssuesResponseSchema", () => {
  it("decodes results array", async () => {
    const data = {
      results: [
        { id: "i1", sequence_id: 1, name: "Issue 1", priority: "low", state: "s1" },
        { id: "i2", sequence_id: 2, name: "Issue 2", priority: "high", state: "s2" },
      ],
    }
    const resp = await decode(IssuesResponseSchema, data)
    expect(resp.results).toHaveLength(2)
  })

  it("decodes empty results", async () => {
    const resp = await decode(IssuesResponseSchema, { results: [] })
    expect(resp.results).toHaveLength(0)
  })
})

describe("StatesResponseSchema", () => {
  it("decodes results", async () => {
    const resp = await decode(StatesResponseSchema, {
      results: [{ id: "s1", name: "Backlog", group: "backlog" }],
    })
    expect(resp.results[0].name).toBe("Backlog")
  })
})

describe("ProjectSchema", () => {
  it("decodes a project", async () => {
    const p = await decode(ProjectSchema, { id: "p1", identifier: "ACME", name: "Acme Project" })
    expect(p.identifier).toBe("ACME")
  })

  it("accepts optional description", async () => {
    const p = await decode(ProjectSchema, {
      id: "p1",
      identifier: "ACME",
      name: "InstUI",
      description: "desc",
    })
    expect(p.description).toBe("desc")
  })
})

describe("ProjectsResponseSchema", () => {
  it("decodes results", async () => {
    const resp = await decode(ProjectsResponseSchema, {
      results: [{ id: "p1", identifier: "WEB", name: "Web Project" }],
    })
    expect(resp.results[0].identifier).toBe("WEB")
  })
})

describe("LabelSchema", () => {
  it("decodes a label", async () => {
    const label = await decode(LabelSchema, { id: "l1", name: "bug" })
    expect(label.name).toBe("bug")
  })

  it("accepts null color", async () => {
    const label = await decode(LabelSchema, { id: "l1", name: "bug", color: null })
    expect(label.color).toBeNull()
  })
})

describe("LabelsResponseSchema", () => {
  it("decodes results", async () => {
    const resp = await decode(LabelsResponseSchema, {
      results: [{ id: "l1", name: "bug" }],
    })
    expect(resp.results).toHaveLength(1)
  })
})

describe("MemberSchema", () => {
  it("decodes a member", async () => {
    const m = await decode(MemberSchema, {
      id: "u1",
      display_name: "Aaron",
      email: "aaron@example.com",
    })
    expect(m.display_name).toBe("Aaron")
  })

  it("accepts null email", async () => {
    const m = await decode(MemberSchema, { id: "u1", display_name: "Aaron", email: null })
    expect(m.email).toBeNull()
  })
})

describe("MembersResponseSchema (flat array)", () => {
  it("decodes a flat array", async () => {
    const members = await decode(MembersResponseSchema, [
      { id: "u1", display_name: "Aaron" },
      { id: "u2", display_name: "Bea" },
    ])
    expect(members).toHaveLength(2)
  })
})

describe("CycleSchema", () => {
  it("decodes a cycle", async () => {
    const c = await decode(CycleSchema, { id: "c1", name: "Sprint 1" })
    expect(c.name).toBe("Sprint 1")
  })

  it("accepts optional dates", async () => {
    const c = await decode(CycleSchema, {
      id: "c1",
      name: "Sprint 1",
      start_date: "2025-01-01",
      end_date: "2025-01-14",
    })
    expect(c.start_date).toBe("2025-01-01")
  })
})

describe("CyclesResponseSchema", () => {
  it("decodes results", async () => {
    const resp = await decode(CyclesResponseSchema, {
      results: [{ id: "c1", name: "Sprint 1" }],
    })
    expect(resp.results[0].id).toBe("c1")
  })
})
