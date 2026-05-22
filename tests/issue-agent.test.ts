import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Option } from "effect";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
	findDuplicateCandidates,
	resolveDescriptionInput,
} from "@/issue-agent";

const BASE = "http://issue-agent-test.local";
const WS = "testws";

const server = setupServer(
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/issues/`, () =>
		HttpResponse.json({
			results: [
				{
					id: "i1",
					sequence_id: 1,
					name: "Audit follow up",
					priority: "medium",
					state: { id: "s-todo", name: "Todo", group: "unstarted" },
				},
			],
		}),
	),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

beforeEach(() => {
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

describe("issue-agent helpers", () => {
	it("returns direct description input", async () => {
		const result = await Effect.runPromise(
			resolveDescriptionInput({
				description: Option.some("<p>Direct</p>"),
				fromFile: Option.none(),
				stdin: false,
			}),
		);
		expect(Option.isSome(result) ? result.value : "").toBe("<p>Direct</p>");
	});

	it("reads description input from a file", async () => {
		const dir = await mkdtemp(join(tmpdir(), "plane-desc-test-"));
		const file = join(dir, "issue.html");
		await writeFile(file, "<p>From file</p>", "utf8");
		const result = await Effect.runPromise(
			resolveDescriptionInput({
				description: Option.none(),
				fromFile: Option.some(file),
				stdin: false,
			}),
		);
		expect(Option.isSome(result) ? result.value : "").toBe("<p>From file</p>");
	});

	it("fails when description input file cannot be read", async () => {
		const result = await Effect.runPromise(
			Effect.either(
				resolveDescriptionInput({
					description: Option.none(),
					fromFile: Option.some("/missing/plane-description.html"),
					stdin: false,
				}),
			),
		);

		expect(result._tag).toBe("Left");
	});

	it("rejects multiple description sources", async () => {
		const result = await Effect.runPromise(
			Effect.either(
				resolveDescriptionInput({
					description: Option.some("direct"),
					fromFile: Option.some("issue.html"),
					stdin: false,
				}),
			),
		);
		expect(result._tag).toBe("Left");
	});

	it("reports exact title duplicates", async () => {
		const result = await Effect.runPromise(
			findDuplicateCandidates({
				projectId: "proj-acme",
				projectKey: "ACME",
				title: "Audit follow up",
				modes: "title",
			}),
		);
		expect(result.candidates[0]?.ref).toBe("ACME-1");
		expect(result.candidates[0]?.match).toBe("title");
	});

	it("reports conservative similarity duplicates", async () => {
		const result = await Effect.runPromise(
			findDuplicateCandidates({
				projectId: "proj-acme",
				projectKey: "ACME",
				title: "Audit follow-up",
				modes: "similarity",
			}),
		);
		expect(result.candidates[0]?.match).toBe("similarity");
	});

	it("defaults unknown dedupe modes to title matching", async () => {
		const result = await Effect.runPromise(
			findDuplicateCandidates({
				projectId: "proj-acme",
				projectKey: "ACME",
				title: "Audit follow up",
				modes: "unknown",
			}),
		);
		expect(result.candidates.length).toBe(1);
	});
});
