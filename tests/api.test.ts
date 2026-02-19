import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { Effect } from "effect"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { api, decodeOrFail } from "@/api"
import { Schema } from "effect"

const BASE = "http://api-test.local"
const WS = "testws"

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterAll(() => server.close())

beforeEach(() => {
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

describe("api.get", () => {
  it("makes a GET request and returns parsed JSON", async () => {
    server.use(
      http.get(`${BASE}/api/v1/workspaces/${WS}/projects/`, () =>
        HttpResponse.json({ results: [{ id: "p1", identifier: "ACME", name: "InstUI" }] }),
      ),
    )
    const result = await Effect.runPromise(api.get("projects/"))
    expect((result as any).results).toHaveLength(1)
  })

  it("strips trailing slash from PLANE_HOST", async () => {
    process.env["PLANE_HOST"] = `${BASE}/`
    server.use(
      http.get(`${BASE}/api/v1/workspaces/${WS}/projects/`, () =>
        HttpResponse.json({ results: [] }),
      ),
    )
    const result = await Effect.runPromise(api.get("projects/"))
    expect((result as any).results).toHaveLength(0)
  })

  it("appends expand=state for issues/ paths", async () => {
    let capturedUrl = ""
    server.use(
      http.get(`${BASE}/api/v1/workspaces/${WS}/projects/p1/issues/`, ({ request }) => {
        capturedUrl = request.url
        return HttpResponse.json({ results: [] })
      }),
    )
    await Effect.runPromise(api.get("projects/p1/issues/"))
    expect(capturedUrl).toContain("expand=state")
  })

  it("fails on HTTP 4xx response", async () => {
    server.use(
      http.get(`${BASE}/api/v1/workspaces/${WS}/projects/`, () =>
        HttpResponse.json({ detail: "Not found" }, { status: 404 }),
      ),
    )
    const result = await Effect.runPromise(Effect.either(api.get("projects/")))
    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left.message).toContain("HTTP 404")
    }
  })

  it("fails on HTTP 401 response", async () => {
    server.use(
      http.get(`${BASE}/api/v1/workspaces/${WS}/projects/`, () =>
        HttpResponse.text("Unauthorized", { status: 401 }),
      ),
    )
    const result = await Effect.runPromise(Effect.either(api.get("projects/")))
    expect(result._tag).toBe("Left")
  })
})

describe("api.post", () => {
  it("sends JSON body and returns parsed response", async () => {
    server.use(
      http.post(`${BASE}/api/v1/workspaces/${WS}/projects/p1/issues/`, async ({ request }) => {
        const body = (await request.json()) as any
        return HttpResponse.json({
          id: "new-issue",
          sequence_id: 99,
          name: body.name,
          priority: "none",
          state: "s1",
        })
      }),
    )
    const result = (await Effect.runPromise(
      api.post("projects/p1/issues/", { name: "New Issue" }),
    )) as any
    expect(result.sequence_id).toBe(99)
    expect(result.name).toBe("New Issue")
  })
})

describe("api.patch", () => {
  it("sends a PATCH and returns updated resource", async () => {
    server.use(
      http.patch(
        `${BASE}/api/v1/workspaces/${WS}/projects/p1/issues/i1/`,
        async ({ request }) => {
          const body = (await request.json()) as any
          return HttpResponse.json({
            id: "i1",
            sequence_id: 1,
            name: "Issue",
            priority: body.priority ?? "low",
            state: "s1",
          })
        },
      ),
    )
    const result = (await Effect.runPromise(
      api.patch("projects/p1/issues/i1/", { priority: "high" }),
    )) as any
    expect(result.priority).toBe("high")
  })
})

describe("api.delete", () => {
  it("sends a DELETE request", async () => {
    let called = false
    server.use(
      http.delete(`${BASE}/api/v1/workspaces/${WS}/projects/p1/issues/i1/`, () => {
        called = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await Effect.runPromise(api.delete("projects/p1/issues/i1/"))
    expect(called).toBe(true)
  })
})

describe("decodeOrFail", () => {
  const NameSchema = Schema.Struct({ name: Schema.String })

  it("decodes valid data", async () => {
    const result = await Effect.runPromise(decodeOrFail(NameSchema, { name: "hello" }))
    expect(result.name).toBe("hello")
  })

  it("fails with Error for invalid data", async () => {
    const result = await Effect.runPromise(
      Effect.either(decodeOrFail(NameSchema, { name: 42 })),
    )
    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(Error)
    }
  })

  it("fails for missing required field", async () => {
    const result = await Effect.runPromise(Effect.either(decodeOrFail(NameSchema, {})))
    expect(result._tag).toBe("Left")
  })
})
