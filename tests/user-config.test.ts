import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_CWD = process.cwd();
const ORIGINAL_PLANE_API_TOKEN = process.env.PLANE_API_TOKEN;
const ORIGINAL_PLANE_HOST = process.env.PLANE_HOST;
const ORIGINAL_PLANE_WORKSPACE = process.env.PLANE_WORKSPACE;
const ORIGINAL_PLANE_PROJECT = process.env.PLANE_PROJECT;

let tempHome = "";

beforeEach(() => {
	tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "plane-cli-config-"));
	process.env.HOME = tempHome;
	delete process.env.PLANE_API_TOKEN;
	delete process.env.PLANE_HOST;
	delete process.env.PLANE_WORKSPACE;
	delete process.env.PLANE_PROJECT;
	process.chdir(tempHome);
});

afterEach(() => {
	if (ORIGINAL_PLANE_API_TOKEN === undefined) {
		delete process.env.PLANE_API_TOKEN;
	} else {
		process.env.PLANE_API_TOKEN = ORIGINAL_PLANE_API_TOKEN;
	}
	if (ORIGINAL_PLANE_HOST === undefined) {
		delete process.env.PLANE_HOST;
	} else {
		process.env.PLANE_HOST = ORIGINAL_PLANE_HOST;
	}
	if (ORIGINAL_PLANE_WORKSPACE === undefined) {
		delete process.env.PLANE_WORKSPACE;
	} else {
		process.env.PLANE_WORKSPACE = ORIGINAL_PLANE_WORKSPACE;
	}
	if (ORIGINAL_PLANE_PROJECT === undefined) {
		delete process.env.PLANE_PROJECT;
	} else {
		process.env.PLANE_PROJECT = ORIGINAL_PLANE_PROJECT;
	}
	if (ORIGINAL_HOME === undefined) {
		delete process.env.HOME;
	} else {
		process.env.HOME = ORIGINAL_HOME;
	}
	process.chdir(ORIGINAL_CWD);
	fs.rmSync(tempHome, { force: true, recursive: true });
});

describe("user config layering", () => {
	it("uses the nearest local config over global config", async () => {
		const {
			findNearestLocalConfigFilePath,
			getConfigDetails,
			getLocalConfigFilePath,
			writeGlobalStoredConfig,
			writeLocalStoredConfig,
		} = await import("@/user-config");
		const repoDir = path.join(tempHome, "repo");
		const appDir = path.join(repoDir, "apps", "web");
		const nestedDir = path.join(appDir, "src");
		fs.mkdirSync(nestedDir, { recursive: true });

		writeGlobalStoredConfig({
			token: "global-token",
			host: "https://global.plane.local",
			workspace: "global-workspace",
			defaultProject: "GLOBAL",
		});
		writeLocalStoredConfig(
			{
				workspace: "repo-workspace",
				defaultProject: "REPO",
			},
			{ cwd: repoDir, target: "cwd" },
		);
		writeLocalStoredConfig(
			{
				host: "https://app.plane.local/",
				defaultProject: "APP",
			},
			{ cwd: appDir, target: "cwd" },
		);

		const config = getConfigDetails(nestedDir);

		expect(findNearestLocalConfigFilePath(nestedDir)).toBe(
			getLocalConfigFilePath(appDir),
		);
		expect(config.token).toBe("global-token");
		expect(config.workspace).toBe("global-workspace");
		// Security: local host is ignored when the token comes from global
		// to prevent an untrusted repo from redirecting a real token.
		expect(config.host).toBe("https://global.plane.local");
		expect(config.defaultProject).toBe("APP");
		expect(config.sources.token).toBe("global");
		expect(config.sources.host).toBe("global");
		expect(config.sources.workspace).toBe("global");
		expect(config.sources.defaultProject).toBe("local");
	});

	it("uses local host when the local config also provides a token", async () => {
		const {
			getConfigDetails,
			writeGlobalStoredConfig,
			writeLocalStoredConfig,
		} = await import("@/user-config");
		const repoDir = path.join(tempHome, "repo");
		fs.mkdirSync(repoDir, { recursive: true });

		writeGlobalStoredConfig({
			token: "global-token",
			host: "https://global.plane.local",
			workspace: "global-workspace",
		});
		writeLocalStoredConfig(
			{
				token: "local-token",
				host: "https://local.plane.local",
				workspace: "local-workspace",
			},
			{ cwd: repoDir, target: "cwd" },
		);

		const config = getConfigDetails(repoDir);

		expect(config.token).toBe("local-token");
		expect(config.host).toBe("https://local.plane.local");
		expect(config.workspace).toBe("local-workspace");
		expect(config.sources.token).toBe("local");
		expect(config.sources.host).toBe("local");
		expect(config.sources.workspace).toBe("local");
	});

	it("applies canonical env vars above local and global config", async () => {
		const {
			getConfigDetails,
			writeGlobalStoredConfig,
			writeLocalStoredConfig,
		} = await import("@/user-config");
		const repoDir = path.join(tempHome, "repo");
		const nestedDir = path.join(repoDir, "packages", "sdk");
		fs.mkdirSync(nestedDir, { recursive: true });

		writeGlobalStoredConfig({
			token: "global-token",
			host: "https://global.plane.local",
			workspace: "global-workspace",
			defaultProject: "GLOBAL",
		});
		writeLocalStoredConfig(
			{
				token: "local-token",
				host: "https://local.plane.local",
				workspace: "local-workspace",
				defaultProject: "LOCAL",
			},
			{ cwd: repoDir, target: "cwd" },
		);

		process.env.PLANE_API_TOKEN = "env-token";
		process.env.PLANE_HOST = "https://env.plane.local/";
		process.env.PLANE_WORKSPACE = "env-workspace";
		process.env.PLANE_PROJECT = "ENV";

		const config = getConfigDetails(nestedDir);

		expect(config.token).toBe("env-token");
		expect(config.host).toBe("https://env.plane.local");
		expect(config.workspace).toBe("env-workspace");
		expect(config.defaultProject).toBe("ENV");
		expect(config.sources.token).toBe("env");
		expect(config.sources.host).toBe("env");
		expect(config.sources.workspace).toBe("env");
		expect(config.sources.defaultProject).toBe("env");
	});

	it("normalizes inherited hosts without an explicit scheme", async () => {
		const { getConfigDetails, writeGlobalStoredConfig } = await import(
			"@/user-config"
		);

		writeGlobalStoredConfig({
			host: "plane.domain.com/",
			workspace: "workspace-1",
			token: "token-1",
		});

		const config = getConfigDetails(tempHome);

		expect(config.host).toBe("https://plane.domain.com");
		expect(config.sources.host).toBe("global");

		process.env.PLANE_HOST = "api.plane.local";
		const envConfig = getConfigDetails(tempHome);
		expect(envConfig.host).toBe("https://api.plane.local");
		expect(envConfig.sources.host).toBe("env");
	});
});
