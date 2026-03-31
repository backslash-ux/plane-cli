import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type ConfigScope = "global" | "local";

type ConfigSource = "env" | "local" | "global" | "default" | "none";

export interface StoredPlaneConfig {
	token?: string;
	host?: string;
	workspace?: string;
	defaultProject?: string;
}

export interface PlaneConfig {
	token: string;
	host: string;
	workspace: string;
	defaultProject: string;
}

export interface PlaneConfigDetails extends PlaneConfig {
	sources: {
		token: ConfigSource;
		host: ConfigSource;
		workspace: ConfigSource;
		defaultProject: ConfigSource;
	};
	paths: {
		globalConfigFile: string;
		localConfigFile: string | null;
		localConfigTargetFile: string;
	};
}

const DEFAULT_HOST = "https://plane.so";

export function normalizeHost(host: string): string {
	const trimmed = host.trim().replace(/\/$/, "");
	if (!trimmed) {
		return trimmed;
	}
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
		return trimmed;
	}
	return `https://${trimmed}`;
}

function cleanConfig(config: StoredPlaneConfig): StoredPlaneConfig {
	const cleaned: StoredPlaneConfig = {};

	if (config.token?.trim()) {
		cleaned.token = config.token.trim();
	}
	if (config.host?.trim()) {
		cleaned.host = normalizeHost(config.host.trim());
	}
	if (config.workspace?.trim()) {
		cleaned.workspace = config.workspace.trim();
	}
	if (config.defaultProject?.trim()) {
		cleaned.defaultProject = config.defaultProject.trim();
	}

	return cleaned;
}

function readConfigFile(filePath: string): StoredPlaneConfig {
	try {
		return cleanConfig(JSON.parse(fs.readFileSync(filePath, "utf8")));
	} catch {
		return {};
	}
}

function writeConfigFile(filePath: string, config: StoredPlaneConfig): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(
		filePath,
		`${JSON.stringify(cleanConfig(config), null, 2)}\n`,
		{
			mode: 0o600,
		},
	);
	fs.chmodSync(filePath, 0o600);
}

export function getGlobalConfigDir(): string {
	return path.join(os.homedir(), ".config", "plane");
}

export function getConfigDir(): string {
	return getGlobalConfigDir();
}

export function getGlobalConfigFilePath(): string {
	return path.join(getGlobalConfigDir(), "config.json");
}

export function getConfigFilePath(): string {
	return getGlobalConfigFilePath();
}

export function getLocalConfigDir(cwd = process.cwd()): string {
	return path.join(path.resolve(cwd), ".plane");
}

export function getLocalConfigFilePath(cwd = process.cwd()): string {
	return path.join(getLocalConfigDir(cwd), "config.json");
}

export function findNearestLocalConfigFilePath(
	cwd = process.cwd(),
): string | null {
	let currentDir = path.resolve(cwd);

	for (;;) {
		const candidate = getLocalConfigFilePath(currentDir);
		if (fs.existsSync(candidate)) {
			return candidate;
		}

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) {
			return null;
		}
		currentDir = parentDir;
	}
}

export function getDefaultConfigWriteScope(cwd = process.cwd()): ConfigScope {
	return findNearestLocalConfigFilePath(cwd) ? "local" : "global";
}

export function getLocalConfigTargetFilePath(
	cwd = process.cwd(),
	target: "active" | "cwd" = "active",
): string {
	if (target === "cwd") {
		return getLocalConfigFilePath(cwd);
	}

	return findNearestLocalConfigFilePath(cwd) ?? getLocalConfigFilePath(cwd);
}

export function readGlobalStoredConfig(): StoredPlaneConfig {
	return readConfigFile(getGlobalConfigFilePath());
}

export function readStoredConfig(): StoredPlaneConfig {
	return readGlobalStoredConfig();
}

export function readLocalStoredConfig(cwd = process.cwd()): StoredPlaneConfig {
	const filePath = findNearestLocalConfigFilePath(cwd);
	return filePath ? readConfigFile(filePath) : {};
}

export function readLocalStoredConfigAtPath(
	cwd = process.cwd(),
): StoredPlaneConfig {
	return readConfigFile(getLocalConfigFilePath(cwd));
}

export function writeGlobalStoredConfig(config: StoredPlaneConfig): void {
	writeConfigFile(getGlobalConfigFilePath(), config);
}

export function writeStoredConfig(config: StoredPlaneConfig): void {
	writeGlobalStoredConfig(config);
}

export function writeLocalStoredConfig(
	config: StoredPlaneConfig,
	options?: {
		cwd?: string;
		target?: "active" | "cwd";
	},
): void {
	writeConfigFile(
		getLocalConfigTargetFilePath(options?.cwd, options?.target),
		config,
	);
}

export function getConfigDetails(cwd = process.cwd()): PlaneConfigDetails {
	const globalConfig = readGlobalStoredConfig();
	const localConfigFile = findNearestLocalConfigFilePath(cwd);
	const localConfig = localConfigFile ? readConfigFile(localConfigFile) : {};

	const envToken = process.env.PLANE_API_TOKEN;
	const envHost = process.env.PLANE_HOST;
	const envWorkspace = process.env.PLANE_WORKSPACE;
	const envProject = process.env.PLANE_PROJECT;

	const token = envToken ?? localConfig.token ?? globalConfig.token ?? "";
	const host = normalizeHost(
		envHost ?? localConfig.host ?? globalConfig.host ?? DEFAULT_HOST,
	);
	const workspace =
		envWorkspace ?? localConfig.workspace ?? globalConfig.workspace ?? "";
	const defaultProject =
		envProject ??
		localConfig.defaultProject ??
		globalConfig.defaultProject ??
		"";

	return {
		token,
		host,
		workspace,
		defaultProject,
		sources: {
			token: envToken
				? "env"
				: localConfig.token
					? "local"
					: globalConfig.token
						? "global"
						: "none",
			host: envHost
				? "env"
				: localConfig.host
					? "local"
					: globalConfig.host
						? "global"
						: "default",
			workspace: envWorkspace
				? "env"
				: localConfig.workspace
					? "local"
					: globalConfig.workspace
						? "global"
						: "none",
			defaultProject: envProject
				? "env"
				: localConfig.defaultProject
					? "local"
					: globalConfig.defaultProject
						? "global"
						: "none",
		},
		paths: {
			globalConfigFile: getGlobalConfigFilePath(),
			localConfigFile,
			localConfigTargetFile: getLocalConfigTargetFilePath(cwd),
		},
	};
}

export function getConfig(): PlaneConfig {
	const { sources: _sources, paths: _paths, ...config } = getConfigDetails();
	return config;
}
