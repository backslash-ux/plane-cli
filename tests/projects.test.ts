import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "@effect/cli";
import { NodeContext } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { _clearProjectCache } from "@/resolve";

const BASE = "http://projects-test.local";
const WS = "testws";
const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_CWD = process.cwd();

const PROJECTS = [
	{ id: "proj-acme", identifier: "ACME", name: "Acme Project" },
	{ id: "proj-web", identifier: "WEB", name: "Web Project" },
	{
		id: "proj-old",
		identifier: "OLD",
		name: "Old Project",
		archived_at: "2025-01-01T00:00:00Z",
	},
];

const server = setupServer(
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/`, () =>
		HttpResponse.json({ results: PROJECTS }),
	),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

let tempHome = "";

beforeEach(() => {
	_clearProjectCache();
	tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "plane-cli-projects-"));
	process.env.HOME = tempHome;
	process.chdir(tempHome);
	process.env.PLANE_HOST = BASE;
	process.env.PLANE_WORKSPACE = WS;
	process.env.PLANE_API_TOKEN = "test-token";
	delete process.env.PLANE_PROJECT;
});

afterEach(() => {
	server.resetHandlers();
	delete process.env.PLANE_HOST;
	delete process.env.PLANE_WORKSPACE;
	delete process.env.PLANE_API_TOKEN;
	delete process.env.PLANE_PROJECT;
	if (ORIGINAL_HOME === undefined) {
		delete process.env.HOME;
	} else {
		process.env.HOME = ORIGINAL_HOME;
	}
	process.chdir(ORIGINAL_CWD);
	fs.rmSync(tempHome, { force: true, recursive: true });
});

describe("projectsUse", () => {
	it("routes through the root CLI for local project persistence", async () => {
		const { projects } = await import("@/commands/projects");
		const { getLocalConfigFilePath } = await import("@/user-config");
		const repoDir = path.join(tempHome, "repo");
		fs.mkdirSync(repoDir, { recursive: true });
		process.chdir(repoDir);
		const root = Command.make("plane").pipe(
			Command.withSubcommands([projects]),
		);
		const cli = Command.run(root, { name: "plane", version: "0.0.0" });

		await Effect.runPromise(
			cli(["_", "_", "projects", "use", "--local", "WEB"]).pipe(
				Effect.provide(Layer.mergeAll(NodeContext.layer)),
			),
		);

		const saved = JSON.parse(
			fs.readFileSync(getLocalConfigFilePath(repoDir), "utf8"),
		) as {
			defaultProject?: string;
		};
		expect(saved.defaultProject).toBe("WEB");
	});

	it("persists the current project in global config by default", async () => {
		const { projectsUseHandler } = await import("@/commands/projects");
		const { getConfigFilePath } = await import("@/user-config");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				projectsUseHandler({ project: "ACME", global: false, local: false }),
			);
		} finally {
			console.log = orig;
		}

		const saved = JSON.parse(fs.readFileSync(getConfigFilePath(), "utf8")) as {
			defaultProject?: string;
		};
		expect(saved.defaultProject).toBe("ACME");
		expect(logs.join("\n")).toContain("Current project set to ACME (global)");
	});

	it("persists the current project in local config when a local config is active", async () => {
		const { projectsUseHandler } = await import("@/commands/projects");
		const { getLocalConfigFilePath, writeLocalStoredConfig } = await import(
			"@/user-config"
		);
		const repoDir = path.join(tempHome, "repo");
		const nestedDir = path.join(repoDir, "packages", "web");
		fs.mkdirSync(nestedDir, { recursive: true });
		writeLocalStoredConfig(
			{ workspace: WS, token: "test-token", host: BASE },
			{ cwd: repoDir, target: "cwd" },
		);
		process.chdir(nestedDir);

		await Effect.runPromise(
			projectsUseHandler({ project: "WEB", global: false, local: false }),
		);

		const saved = JSON.parse(
			fs.readFileSync(getLocalConfigFilePath(repoDir), "utf8"),
		) as {
			defaultProject?: string;
		};
		expect(saved.defaultProject).toBe("WEB");
	});

	it("allows forcing a global current project even when local config is active", async () => {
		const { projectsUseHandler } = await import("@/commands/projects");
		const { getConfigFilePath, writeLocalStoredConfig } = await import(
			"@/user-config"
		);
		const repoDir = path.join(tempHome, "repo");
		const nestedDir = path.join(repoDir, "apps", "cli");
		fs.mkdirSync(nestedDir, { recursive: true });
		writeLocalStoredConfig(
			{ workspace: WS, token: "test-token", host: BASE },
			{ cwd: repoDir, target: "cwd" },
		);
		process.chdir(nestedDir);

		await Effect.runPromise(
			projectsUseHandler({ project: "ACME", global: true, local: false }),
		);

		const saved = JSON.parse(fs.readFileSync(getConfigFilePath(), "utf8")) as {
			defaultProject?: string;
		};
		expect(saved.defaultProject).toBe("ACME");
	});
});

describe("projectsCurrent", () => {
	it("prints the saved current project", async () => {
		const { writeStoredConfig } = await import("@/user-config");
		writeStoredConfig({ defaultProject: "WEB" });
		const { projectsCurrentHandler } = await import("@/commands/projects");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(projectsCurrentHandler());
		} finally {
			console.log = orig;
		}

		expect(logs.join("\n")).toContain("WEB");
		expect(logs.join("\n")).toContain("proj-web");
		expect(logs.join("\n")).toContain("Web Project");
		expect(logs.join("\n")).toContain("(global)");
	});

	it("reports when the effective current project comes from local config", async () => {
		const { writeLocalStoredConfig } = await import("@/user-config");
		const repoDir = path.join(tempHome, "repo");
		const nestedDir = path.join(repoDir, "services", "api");
		fs.mkdirSync(nestedDir, { recursive: true });
		writeLocalStoredConfig(
			{
				workspace: WS,
				token: "test-token",
				host: BASE,
				defaultProject: "ACME",
			},
			{ cwd: repoDir, target: "cwd" },
		);
		process.chdir(nestedDir);
		const { projectsCurrentHandler } = await import("@/commands/projects");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(projectsCurrentHandler());
		} finally {
			console.log = orig;
		}

		expect(logs.join("\n")).toContain("ACME");
		expect(logs.join("\n")).toContain("(local)");
	});
});

describe("projectsList", () => {
	it("marks the saved current project", async () => {
		const { writeStoredConfig } = await import("@/user-config");
		writeStoredConfig({ defaultProject: "WEB" });
		const { projectsListHandler } = await import("@/commands/projects");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(projectsListHandler());
		} finally {
			console.log = orig;
		}

		expect(logs.join("\n")).toContain("* WEB");
		expect(logs.join("\n")).not.toContain("OLD");
	});

	it("includes archived projects when requested", async () => {
		const { projectsListHandler } = await import("@/commands/projects");
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(projectsListHandler({ includeArchived: true }));
		} finally {
			console.log = orig;
		}

		expect(logs.join("\n")).toContain("OLD");
		expect(logs.join("\n")).toContain("(archived)");
	});
});
