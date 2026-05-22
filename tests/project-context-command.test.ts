import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { projectContextHandler } from "@/commands/project";
import { _clearProjectCache } from "@/resolve";

const BASE = "http://context-test.local";
const WS = "testws";

const server = setupServer(
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/`, () =>
		HttpResponse.json({
			results: [{ id: "proj-acme", identifier: "ACME", name: "Acme" }],
		}),
	),
);

let originalCwd: string;

beforeAll(() => {
	originalCwd = process.cwd();
	server.listen({ onUnhandledRequest: "error" });
});
afterAll(() => {
	process.chdir(originalCwd);
	server.close();
});

beforeEach(() => {
	_clearProjectCache();
	process.env.PLANE_HOST = BASE;
	process.env.PLANE_WORKSPACE = WS;
	process.env.PLANE_API_TOKEN = "test-token";
	process.env.PLANE_PROJECT = "ACME";
});

afterEach(() => {
	server.resetHandlers();
	process.chdir(originalCwd);
	delete process.env.PLANE_HOST;
	delete process.env.PLANE_WORKSPACE;
	delete process.env.PLANE_API_TOKEN;
	delete process.env.PLANE_PROJECT;
});

describe("project context", () => {
	it("prints the local project-context snapshot", async () => {
		const dir = await mkdtemp(join(tmpdir(), "plane-context-test-"));
		await mkdir(join(dir, ".plane"));
		await writeFile(
			join(dir, ".plane", "project-context.json"),
			JSON.stringify({
				project: { identifier: "ACME", name: "Acme" },
				features: { cycles: true, modules: false },
				helpers: {
					states: { total: 2 },
					labels: { total: 1 },
					estimate: { enabled: false, points: [] },
				},
			}),
			"utf8",
		);
		process.chdir(dir);
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));
		try {
			await Effect.runPromise(projectContextHandler({ project: "@current" }));
		} finally {
			console.log = orig;
		}
		const output = logs.join("\n");
		if (output.trim().startsWith("{")) {
			const parsed = JSON.parse(output);
			expect(parsed.project.identifier).toBe("ACME");
			expect(parsed.helpers.labels.total).toBe(1);
		} else {
			expect(output).toContain("ACME  Acme");
			expect(output).toContain("cycles=enabled");
			expect(output).toContain("Labels: 1");
		}
	});

	it("fails when the local context belongs to a different project", async () => {
		const dir = await mkdtemp(join(tmpdir(), "plane-context-test-"));
		await mkdir(join(dir, ".plane"));
		await writeFile(
			join(dir, ".plane", "project-context.json"),
			JSON.stringify({
				project: { identifier: "OTHER", name: "Other" },
				features: {},
				helpers: { states: { total: 0 }, labels: { total: 0 } },
			}),
			"utf8",
		);
		process.chdir(dir);
		const result = await Effect.runPromise(
			Effect.either(projectContextHandler({ project: "@current" })),
		);
		expect(result._tag).toBe("Left");
	});
});
