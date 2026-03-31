import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	mock,
} from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Effect } from "effect";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { _clearProjectCache } from "@/resolve";

const BASE = "http://feature-gates-test.local";
const WS = "testws";
const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_CWD = process.cwd();

const PROJECTS = [
	{ id: "proj-acme", identifier: "ACME", name: "Acme Project" },
];

const PROJECT_DETAIL = {
	id: "proj-acme",
	identifier: "ACME",
	name: "Acme Project",
	module_view: true,
	cycle_view: false,
	issue_views_view: true,
	page_view: true,
	intake_view: true,
	estimate: "est1",
};

const STATES = [
	{ id: "st-backlog", name: "Backlog", group: "backlog", color: "#888888" },
	{
		id: "st-progress",
		name: "In Progress",
		group: "started",
		color: "#ffaa00",
	},
];

const LABELS = [
	{ id: "lbl-ready", name: "Ready to Deploy", color: "#00aa88", parent: null },
	{ id: "lbl-backend", name: "Backend", color: "#00bb66", parent: null },
];

const ESTIMATE = {
	id: "est1",
	name: "Story Points",
	description: "Default scale",
	type: "points",
	last_used: true,
	project: "proj-acme",
	workspace: "ws1",
};

const ESTIMATE_POINTS = [
	{
		id: "ep1",
		estimate: "est1",
		key: 1,
		value: "1",
		description: "Tiny",
		project: "proj-acme",
		workspace: "ws1",
	},
	{
		id: "ep2",
		estimate: "est1",
		key: 2,
		value: "2",
		description: "Small",
		project: "proj-acme",
		workspace: "ws1",
	},
];

const server = setupServer(
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/`, () =>
		HttpResponse.json({ results: PROJECTS }),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/`, () =>
		HttpResponse.json(PROJECT_DETAIL),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/states/`, () =>
		HttpResponse.json({ results: STATES }),
	),
	http.get(`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/labels/`, () =>
		HttpResponse.json({ results: LABELS }),
	),
	http.get(
		`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/estimates/`,
		() => HttpResponse.json(ESTIMATE),
	),
	http.get(
		`${BASE}/api/v1/workspaces/${WS}/projects/proj-acme/estimates/est1/estimate-points/`,
		() => HttpResponse.json(ESTIMATE_POINTS),
	),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

let tempHome = "";
let promptResponses: string[] = [];

mock.module("node:readline", () => ({
	createInterface: () => ({
		question: (_question: string, callback: (answer: string) => void) => {
			callback(promptResponses.shift() ?? "");
		},
		close: () => undefined,
	}),
}));

beforeEach(() => {
	_clearProjectCache();
	tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "plane-cli-features-"));
	process.env.HOME = tempHome;
	process.chdir(tempHome);
	process.env.PLANE_HOST = BASE;
	process.env.PLANE_WORKSPACE = WS;
	process.env.PLANE_API_TOKEN = "test-token";
	delete process.env.PLANE_PROJECT;
	promptResponses = [];
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

describe("feature gates", () => {
	it("fails with a definitive error when cycles are disabled", async () => {
		const { cyclesListHandler } = await import("@/commands/cycles");
		const result = await Effect.runPromise(
			Effect.either(cyclesListHandler({ project: "ACME" })),
		);
		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left.message).toContain("Project ACME has Cycles disabled");
			expect(result.left.message).toContain("cycle_view=false");
			expect(result.left.message).toContain("Enable Cycles");
		}
	});

	it("reports project feature flags during local init", async () => {
		const { initHandler } = await import("@/commands/init");
		const { getLocalAgentsFilePath } = await import("@/project-agents");
		const { getLocalProjectContextFilePath } = await import(
			"@/project-context"
		);
		const repoDir = path.join(tempHome, "repo");
		fs.mkdirSync(repoDir, { recursive: true });
		process.chdir(repoDir);
		promptResponses = ["", "", "", "1"];
		const logs: string[] = [];
		const orig = console.log;
		console.log = (...args: unknown[]) => logs.push(args.join(" "));

		try {
			await Effect.runPromise(
				initHandler({ global: false, local: true }, "local"),
			);
		} finally {
			console.log = orig;
		}

		const output = logs.join("\n");
		expect(output).toContain("Project feature flags:");
		expect(output).toContain("Cycles: disabled");
		expect(output).toContain("Modules: enabled");
		expect(output).toContain("Project helper saved to");
		expect(output).toContain("States:    2");
		expect(output).toContain("Labels:    2");
		expect(output).toContain("Estimate:  Story Points (2 points)");
		expect(output).toContain("Local AGENTS.md updated at");
		expect(output).toContain(
			"Disabled features will fail with explicit errors until Plane enables them",
		);
		expect(fs.existsSync(path.join(repoDir, ".plane", "config.json"))).toBe(
			true,
		);
		const helperPath = getLocalProjectContextFilePath(repoDir);
		expect(fs.existsSync(helperPath)).toBe(true);
		const agentsPath = getLocalAgentsFilePath(repoDir);
		expect(fs.existsSync(agentsPath)).toBe(true);
		const agentsContent = fs.readFileSync(agentsPath, "utf8");
		expect(agentsContent).toContain("## Plane Project Context");
		expect(agentsContent).toContain("Plane project ACME (Acme Project)");
		expect(agentsContent).toContain("./.plane/project-context.json");
		expect(agentsContent).toContain(
			"Prefer the `plane` CLI from this repository root for Plane project work instead of direct API calls.",
		);
		expect(agentsContent).toContain("plane issues list @current");
		expect(agentsContent).toContain("plane issue get ACME-12");
		const helper = JSON.parse(fs.readFileSync(helperPath, "utf8")) as {
			features: { estimates: boolean };
			helpers: {
				states: { byName: Record<string, { id: string }> };
				labels: { byName: Record<string, { id: string }> };
				estimate: {
					enabled: boolean;
					pointsByValue: Record<string, { id: string }>;
				};
			};
		};
		expect(helper.features.estimates).toBe(true);
		expect(helper.helpers.states.byName.backlog.id).toBe("st-backlog");
		expect(helper.helpers.labels.byName["ready to deploy"].id).toBe(
			"lbl-ready",
		);
		expect(helper.helpers.estimate.enabled).toBe(true);
		expect(helper.helpers.estimate.pointsByValue["1"].id).toBe("ep1");
	});

	it("preserves user AGENTS content and refreshes the managed project section", async () => {
		const { initHandler } = await import("@/commands/init");
		const { getLocalAgentsFilePath } = await import("@/project-agents");
		const repoDir = path.join(tempHome, "repo");
		fs.mkdirSync(repoDir, { recursive: true });
		process.chdir(repoDir);
		const existingAgents = [
			"# Team Instructions",
			"",
			"Keep release notes short.",
		].join("\n");
		fs.writeFileSync(
			path.join(repoDir, "AGENTS.md"),
			`${existingAgents}\n`,
			"utf8",
		);

		promptResponses = ["", "", "", "1"];
		await Effect.runPromise(
			initHandler({ global: false, local: true }, "local"),
		);

		promptResponses = ["", "", "", ""];
		await Effect.runPromise(
			initHandler({ global: false, local: true }, "local"),
		);

		const agentsPath = getLocalAgentsFilePath(repoDir);
		const agentsContent = fs.readFileSync(agentsPath, "utf8");
		expect(agentsContent).toContain(existingAgents);
		expect(
			agentsContent
				.trimEnd()
				.endsWith("<!-- plane-cli local project context end -->"),
		).toBe(true);
		expect(
			agentsContent.match(/plane-cli local project context start/g)?.length,
		).toBe(1);
		expect(agentsContent).toContain(
			"Read `./.plane/project-context.json` before planning or applying Plane project changes.",
		);
		expect(agentsContent).toContain(
			"If the shell may contain inherited `PLANE_*` variables, clear them before relying on `./.plane/config.json`.",
		);
		expect(agentsContent).toContain("plane projects current");
	});
});

describe("SKILL.md import into AGENTS.md", () => {
	it("imports SKILL.md when user answers 'y'", async () => {
		const { initHandler } = await import("@/commands/init");
		const { getLocalAgentsFilePath } = await import("@/project-agents");
		const repoDir = path.join(tempHome, "repo");
		fs.mkdirSync(repoDir, { recursive: true });
		process.chdir(repoDir);
		// host, workspace, token, project selection, skill import
		promptResponses = ["", "", "", "1", "y"];
		await Effect.runPromise(
			initHandler({ global: false, local: true }, "local"),
		);
		const agentsPath = getLocalAgentsFilePath(repoDir);
		const agentsContent = fs.readFileSync(agentsPath, "utf8");
		expect(agentsContent).toContain("<!-- plane-cli skill start -->");
		expect(agentsContent).toContain("<!-- plane-cli skill end -->");
	});

	it("does not import SKILL.md when user declines (default N)", async () => {
		const { initHandler } = await import("@/commands/init");
		const { getLocalAgentsFilePath } = await import("@/project-agents");
		const repoDir = path.join(tempHome, "repo");
		fs.mkdirSync(repoDir, { recursive: true });
		process.chdir(repoDir);
		// empty response = default "N"
		promptResponses = ["", "", "", "1", ""];
		await Effect.runPromise(
			initHandler({ global: false, local: true }, "local"),
		);
		const agentsPath = getLocalAgentsFilePath(repoDir);
		const agentsContent = fs.readFileSync(agentsPath, "utf8");
		expect(agentsContent).not.toContain("<!-- plane-cli skill start -->");
	});

	it("idempotently updates existing SKILL section on re-run when user confirms", async () => {
		const { initHandler } = await import("@/commands/init");
		const { getLocalAgentsFilePath } = await import("@/project-agents");
		const repoDir = path.join(tempHome, "repo");
		fs.mkdirSync(repoDir, { recursive: true });
		process.chdir(repoDir);
		// First run: import skill
		promptResponses = ["", "", "", "1", "y"];
		await Effect.runPromise(
			initHandler({ global: false, local: true }, "local"),
		);
		// Second run: user confirms update (default Y when already present)
		promptResponses = ["", "", "", "1", ""];
		await Effect.runPromise(
			initHandler({ global: false, local: true }, "local"),
		);
		const agentsPath = getLocalAgentsFilePath(repoDir);
		const agentsContent = fs.readFileSync(agentsPath, "utf8");
		expect(agentsContent.match(/<!-- plane-cli skill start -->/g)?.length).toBe(
			1,
		);
		expect(agentsContent.match(/<!-- plane-cli skill end -->/g)?.length).toBe(
			1,
		);
	});

	it("importSkillIntoAgentsFile creates section in a new file", async () => {
		const { importSkillIntoAgentsFile, getLocalAgentsFilePath } = await import(
			"@/project-agents"
		);
		const repoDir = path.join(tempHome, "repo");
		fs.mkdirSync(repoDir, { recursive: true });
		importSkillIntoAgentsFile("# CLI Guide\nAll commands here.", repoDir);
		const filePath = getLocalAgentsFilePath(repoDir);
		const content = fs.readFileSync(filePath, "utf8");
		expect(content).toContain("<!-- plane-cli skill start -->");
		expect(content).toContain("# CLI Guide");
		expect(content).toContain("<!-- plane-cli skill end -->");
	});

	it("hasSkillSectionInAgentsFile returns false before import", async () => {
		const { hasSkillSectionInAgentsFile } = await import("@/project-agents");
		const repoDir = path.join(tempHome, "repo");
		fs.mkdirSync(repoDir, { recursive: true });
		expect(hasSkillSectionInAgentsFile(repoDir)).toBe(false);
	});

	it("hasSkillSectionInAgentsFile returns true after import", async () => {
		const { importSkillIntoAgentsFile, hasSkillSectionInAgentsFile } =
			await import("@/project-agents");
		const repoDir = path.join(tempHome, "repo");
		fs.mkdirSync(repoDir, { recursive: true });
		importSkillIntoAgentsFile("# CLI Guide", repoDir);
		expect(hasSkillSectionInAgentsFile(repoDir)).toBe(true);
	});
});
