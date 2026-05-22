import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { Effect } from "effect";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { membersListHandler } from "@/commands/members";
import { statesListHandler } from "@/commands/states";
import { _clearProjectCache } from "@/resolve";

const BASE = "http://members-states-test.local";
const WS = "testws";

const server = setupServer(
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/`, () =>
		HttpResponse.json({
			results: [{ id: "proj-acme", identifier: "ACME", name: "Acme" }],
		}),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/members/`, () =>
		HttpResponse.json([
			{ id: "m1", display_name: "Alice", email: "alice@example.com" },
			{ id: "m2", display_name: "Bob", email: null },
		]),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/states/`, () =>
		HttpResponse.json({
			results: [
				{ id: "s1", name: "Todo", group: "unstarted" },
				{ id: "s2", name: "Done", group: "completed" },
			],
		}),
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

describe("members and states list commands", () => {
	it("lists workspace members", async () => {
		const output = await captureLogs(() => membersListHandler());
		expect(output).toContain("Alice");
		expect(output).toContain("alice@example.com");
		expect(output).toContain("Bob");
	});

	it("lists project states", async () => {
		const output = await captureLogs(() =>
			statesListHandler({ project: "ACME" }),
		);
		expect(output).toContain("unstarted");
		expect(output).toContain("Todo");
		expect(output).toContain("completed");
	});
});

async function captureLogs(effectFactory: () => Effect.Effect<unknown, Error>) {
	const logs: string[] = [];
	const orig = console.log;
	console.log = (...args: unknown[]) => logs.push(args.join(" "));
	try {
		await Effect.runPromise(effectFactory());
	} finally {
		console.log = orig;
	}
	return logs.join("\n");
}
