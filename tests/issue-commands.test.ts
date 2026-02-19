import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { Effect } from "effect"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { _clearProjectCache } from "@/resolve"

const BASE = "http://issue-cmd-test.local"
const WS = "testws"

const PROJECTS = [{ id: "proj-acme", identifier: "ACME", name: "Acme Project" }]
const ISSUES = [
  { id: "i1", sequence_id: 29, name: "Migrate Button", priority: "high", state: "s1" },
  { id: "i2", sequence_id: 30, name: "Migrate Input", priority: "medium", state: "s2" },
]
const STATES = [
  { id: "s-done", name: "Done", group: "completed" },
  { id: "s-todo", name: "Todo", group: "unstarted" },
]

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
)

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterAll(() => server.close())

beforeEach(() => {
  _clearProjectCache()
  process.env["PLANE_HOST"] = BASE
  process.env["PLANE_WORKSPACE"] = WS
  process.env["PLANE_API_TOKEN"] = "test-token"
})

afterEach(() => {
  server.resetHandlers()
  delete process.env["PLANE_HOST"]
  delete process.env["PLANE_WORKSPACE"]
  delete process.env["PLANE_API_TOKEN"]
})

describe("issueGet", () => {
  it("prints full JSON for an issue", async () => {
    const { issueGet } = await import("@/commands/issue")
    const logs: string[] = []
    const orig = console.log
    console.log = (...args: unknown[]) => logs.push(args.join(" "))

    try {
      await Effect.runPromise((issueGet as any).handler({ ref: "ACME-29" }))
    } finally {
      console.log = orig
    }

    const output = logs.join("\n")
    const parsed = JSON.parse(output)
    expect(parsed.id).toBe("i1")
    expect(parsed.name).toBe("Migrate Button")
  })
})

describe("issueUpdate", () => {
  it("updates state", async () => {
    server.use(
      http.patch(
        `${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/`,
        async ({ request }) => {
          const body = (await request.json()) as any
          return HttpResponse.json({
            id: "i1",
            sequence_id: 29,
            name: "Migrate Button",
            priority: "high",
            state: body.state ?? "s1",
          })
        },
      ),
    )

    const { issueUpdate } = await import("@/commands/issue")
    const logs: string[] = []
    const orig = console.log
    console.log = (...args: unknown[]) => logs.push(args.join(" "))

    try {
      await Effect.runPromise(
        (issueUpdate as any).handler({
          ref: "ACME-29",
          state: { _tag: "Some", value: "completed" },
          priority: { _tag: "None" },
          description: { _tag: "None" },
        }),
      )
    } finally {
      console.log = orig
    }

    expect(logs.join("\n")).toContain("Updated ACME-29")
  })

  it("updates priority", async () => {
    server.use(
      http.patch(
        `${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/`,
        async ({ request }) => {
          const body = (await request.json()) as any
          return HttpResponse.json({
            id: "i1",
            sequence_id: 29,
            name: "Migrate Button",
            priority: body.priority,
            state: "s1",
          })
        },
      ),
    )

    const { issueUpdate } = await import("@/commands/issue")
    const logs: string[] = []
    const orig = console.log
    console.log = (...args: unknown[]) => logs.push(args.join(" "))

    try {
      await Effect.runPromise(
        (issueUpdate as any).handler({
          ref: "ACME-29",
          state: { _tag: "None" },
          priority: { _tag: "Some", value: "urgent" },
          description: { _tag: "None" },
        }),
      )
    } finally {
      console.log = orig
    }

    expect(logs.join("\n")).toContain("urgent")
  })

  it("fails when nothing to update", async () => {
    const { issueUpdate } = await import("@/commands/issue")
    const result = await Effect.runPromise(
      Effect.either(
        (issueUpdate as any).handler({
          ref: "ACME-29",
          state: { _tag: "None" },
          priority: { _tag: "None" },
          description: { _tag: "None" },
        }),
      ),
    )
    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect((result.left as Error).message).toContain("Nothing to update")
    }
  })
})

describe("issueComment", () => {
  it("adds a comment", async () => {
    let postedBody: unknown
    server.use(
      http.post(
        `${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/comments/`,
        async ({ request }) => {
          postedBody = await request.json()
          return HttpResponse.json({ id: "c1" }, { status: 201 })
        },
      ),
    )

    const { issueComment } = await import("@/commands/issue")
    const logs: string[] = []
    const orig = console.log
    console.log = (...args: unknown[]) => logs.push(args.join(" "))

    try {
      await Effect.runPromise(
        (issueComment as any).handler({ ref: "ACME-29", text: "Fixed in latest build" }),
      )
    } finally {
      console.log = orig
    }

    expect((postedBody as any).comment_html).toContain("Fixed in latest build")
    expect(logs.join("\n")).toContain("Comment added to ACME-29")
  })

  it("HTML-escapes angle brackets in comment text", async () => {
    let postedBody: unknown
    server.use(
      http.post(
        `${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/comments/`,
        async ({ request }) => {
          postedBody = await request.json()
          return HttpResponse.json({ id: "c2" }, { status: 201 })
        },
      ),
    )

    const { issueComment } = await import("@/commands/issue")
    try {
      await Effect.runPromise(
        (issueComment as any).handler({ ref: "ACME-29", text: "<script>alert(1)</script>" }),
      )
    } finally {}

    expect((postedBody as any).comment_html).toContain("&lt;script&gt;")
    expect((postedBody as any).comment_html).not.toContain("<script>")
  })
})

describe("issueCreate", () => {
  it("creates an issue with just a title", async () => {
    server.use(
      http.post(
        `${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`,
        async ({ request }) => {
          const body = (await request.json()) as any
          return HttpResponse.json({
            id: "new-i",
            sequence_id: 99,
            name: body.name,
            priority: "none",
            state: "s1",
          })
        },
      ),
    )

    const { issueCreate } = await import("@/commands/issue")
    const logs: string[] = []
    const orig = console.log
    console.log = (...args: unknown[]) => logs.push(args.join(" "))

    try {
      await Effect.runPromise(
        (issueCreate as any).handler({
          project: "ACME",
          title: "New issue",
          priority: { _tag: "None" },
          state: { _tag: "None" },
          description: { _tag: "None" },
        }),
      )
    } finally {
      console.log = orig
    }

    expect(logs.join("\n")).toContain("ACME-99")
    expect(logs.join("\n")).toContain("New issue")
  })

  it("creates an issue with priority and state", async () => {
    server.use(
      http.post(
        `${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`,
        async ({ request }) => {
          const body = (await request.json()) as any
          return HttpResponse.json({
            id: "new-i2",
            sequence_id: 100,
            name: body.name,
            priority: body.priority,
            state: body.state ?? "s1",
          })
        },
      ),
    )

    const { issueCreate } = await import("@/commands/issue")
    const logs: string[] = []
    const orig = console.log
    console.log = (...args: unknown[]) => logs.push(args.join(" "))

    try {
      await Effect.runPromise(
        (issueCreate as any).handler({
          project: "ACME",
          title: "High priority issue",
          priority: { _tag: "Some", value: "high" },
          state: { _tag: "Some", value: "completed" },
          description: { _tag: "None" },
        }),
      )
    } finally {
      console.log = orig
    }

    expect(logs.join("\n")).toContain("ACME-100")
  })
})

describe("issueCreate description", () => {
  it("creates an issue with a description", async () => {
    let postedBody: unknown
    server.use(
      http.post(
        `${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`,
        async ({ request }) => {
          postedBody = await request.json()
          return HttpResponse.json({
            id: "new-i3",
            sequence_id: 101,
            name: (postedBody as any).name,
            priority: "none",
            state: "s1",
          })
        },
      ),
    )

    const { issueCreate } = await import("@/commands/issue")
    await Effect.runPromise(
      (issueCreate as any).handler({
        project: "ACME",
        title: "Issue with description",
        priority: { _tag: "None" },
        state: { _tag: "None" },
        description: { _tag: "Some", value: "Some context here" },
      }),
    )

    expect((postedBody as any).description_html).toBe("<p>Some context here</p>")
  })

  it("HTML-escapes angle brackets in description", async () => {
    let postedBody: unknown
    server.use(
      http.post(
        `${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`,
        async ({ request }) => {
          postedBody = await request.json()
          return HttpResponse.json({
            id: "new-i4",
            sequence_id: 102,
            name: (postedBody as any).name,
            priority: "none",
            state: "s1",
          })
        },
      ),
    )

    const { issueCreate } = await import("@/commands/issue")
    await Effect.runPromise(
      (issueCreate as any).handler({
        project: "ACME",
        title: "XSS test",
        priority: { _tag: "None" },
        state: { _tag: "None" },
        description: { _tag: "Some", value: "<script>alert(1)</script>" },
      }),
    )

    expect((postedBody as any).description_html).toContain("&lt;script&gt;")
    expect((postedBody as any).description_html).not.toContain("<script>")
  })
})

describe("issueUpdate description", () => {
  it("updates description", async () => {
    let patchedBody: unknown
    server.use(
      http.patch(
        `${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/`,
        async ({ request }) => {
          patchedBody = await request.json()
          return HttpResponse.json({
            id: "i1",
            sequence_id: 29,
            name: "Migrate Button",
            priority: "high",
            state: "s1",
          })
        },
      ),
    )

    const { issueUpdate } = await import("@/commands/issue")
    await Effect.runPromise(
      (issueUpdate as any).handler({
        ref: "ACME-29",
        state: { _tag: "None" },
        priority: { _tag: "None" },
        description: { _tag: "Some", value: "Updated description" },
      }),
    )

    expect((patchedBody as any).description_html).toBe("<p>Updated description</p>")
  })

  it("HTML-escapes angle brackets in update description", async () => {
    let patchedBody: unknown
    server.use(
      http.patch(
        `${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/`,
        async ({ request }) => {
          patchedBody = await request.json()
          return HttpResponse.json({
            id: "i1",
            sequence_id: 29,
            name: "Migrate Button",
            priority: "high",
            state: "s1",
          })
        },
      ),
    )

    const { issueUpdate } = await import("@/commands/issue")
    await Effect.runPromise(
      (issueUpdate as any).handler({
        ref: "ACME-29",
        state: { _tag: "None" },
        priority: { _tag: "None" },
        description: { _tag: "Some", value: "<b>bold</b>" },
      }),
    )

    expect((patchedBody as any).description_html).toContain("&lt;b&gt;")
    expect((patchedBody as any).description_html).not.toContain("<b>")
  })
})

describe("issueDelete", () => {
  it("deletes an issue", async () => {
    let deleted = false
    server.use(
      http.delete(
        `${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/`,
        () => {
          deleted = true
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )

    const { issueDelete } = await import("@/commands/issue")
    const logs: string[] = []
    const orig = console.log
    console.log = (...args: unknown[]) => logs.push(args.join(" "))

    try {
      await Effect.runPromise((issueDelete as any).handler({ ref: "ACME-29" }))
    } finally {
      console.log = orig
    }

    expect(deleted).toBe(true)
    expect(logs.join("\n")).toContain("Deleted ACME-29")
  })
})
