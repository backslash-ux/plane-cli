import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test"
import { Effect } from "effect"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { _clearProjectCache } from "@/resolve"

const BASE = "http://act-test.local"
const WS = "testws"

const PROJECTS = [{ id: "proj-acme", identifier: "ACME", name: "Acme Project" }]
const ISSUES = [{ id: "i1", sequence_id: 29, name: "Migrate Button", priority: "high", state: "s1" }]
const ACTIVITIES = [
  {
    id: "act1",
    actor_detail: { display_name: "Aaron" },
    field: "state",
    old_value: "Backlog",
    new_value: "In Progress",
    verb: "updated",
    created_at: "2025-01-15T10:30:00Z",
  },
  {
    id: "act2",
    actor_detail: { display_name: "Bea" },
    field: null,
    old_value: null,
    new_value: null,
    verb: "created",
    created_at: "2025-01-14T08:00:00Z",
  },
]

const server = setupServer(
  http.get(`${BASE}/api/v1/workspaces/${WS}/projects/`, () =>
    HttpResponse.json({ results: PROJECTS }),
  ),
  http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`, () =>
    HttpResponse.json({ results: ISSUES }),
  ),
  http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/activities/`, () =>
    HttpResponse.json({ results: ACTIVITIES }),
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

describe("issueActivity command handler", () => {
  it("fetches and formats activity with field changes", async () => {
    const { issueActivity } = await import("@/commands/issue")
    const logs: string[] = []
    const originalLog = console.log
    console.log = (...args: unknown[]) => logs.push(args.join(" "))

    try {
      await Effect.runPromise(
        (issueActivity as any).handler({ ref: "ACME-29" }),
      )
    } finally {
      console.log = originalLog
    }

    const output = logs.join("\n")
    expect(output).toContain("Aaron")
    expect(output).toContain("state")
    expect(output).toContain("Backlog")
    expect(output).toContain("In Progress")
  })

  it("shows 'No activity found' when empty", async () => {
    server.use(
      http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/activities/`, () =>
        HttpResponse.json({ results: [] }),
      ),
    )

    const { issueActivity } = await import("@/commands/issue")
    const logs: string[] = []
    const originalLog = console.log
    console.log = (...args: unknown[]) => logs.push(args.join(" "))

    try {
      await Effect.runPromise(
        (issueActivity as any).handler({ ref: "ACME-29" }),
      )
    } finally {
      console.log = originalLog
    }

    expect(logs.join("\n")).toContain("No activity found")
  })

  it("formats activity without field (verb-only)", async () => {
    server.use(
      http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/activities/`, () =>
        HttpResponse.json({
          results: [
            {
              id: "act3",
              actor_detail: { display_name: "Bea" },
              verb: "created",
              created_at: "2025-01-14T08:00:00Z",
            },
          ],
        }),
      ),
    )

    const { issueActivity } = await import("@/commands/issue")
    const logs: string[] = []
    const originalLog = console.log
    console.log = (...args: unknown[]) => logs.push(args.join(" "))

    try {
      await Effect.runPromise(
        (issueActivity as any).handler({ ref: "ACME-29" }),
      )
    } finally {
      console.log = originalLog
    }

    const output = logs.join("\n")
    expect(output).toContain("Bea")
    expect(output).toContain("created")
  })

  it("handles missing actor_detail gracefully", async () => {
    server.use(
      http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/i1/activities/`, () =>
        HttpResponse.json({
          results: [{ id: "act4", field: "priority", old_value: "low", new_value: "high", created_at: "2025-01-15T10:30:00Z" }],
        }),
      ),
    )

    const { issueActivity } = await import("@/commands/issue")
    const logs: string[] = []
    const originalLog = console.log
    console.log = (...args: unknown[]) => logs.push(args.join(" "))

    try {
      await Effect.runPromise(
        (issueActivity as any).handler({ ref: "ACME-29" }),
      )
    } finally {
      console.log = originalLog
    }

    const output = logs.join("\n")
    expect(output).toContain("priority")
    expect(output).toContain("?") // fallback for missing actor
  })
})
