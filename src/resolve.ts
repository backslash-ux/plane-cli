import { Effect } from "effect";
import { api, decodeOrFail } from "./api.js";
import type { Issue, Project, ProjectDetail } from "./config.js";
import {
	CyclesResponseSchema,
	IssuesResponseSchema,
	isProjectArchived,
	isProjectIntakeEnabled,
	LabelsResponseSchema,
	MembersResponseSchema,
	ModulesResponseSchema,
	ProjectDetailSchema,
	ProjectsResponseSchema,
	StatesResponseSchema,
} from "./config.js";
import { getConfig } from "./user-config.js";

// Cache project list within a process invocation
let _projectListCache: ReadonlyArray<Project> | null = null;
let _projectCache: {
	active: Record<string, string> | null;
	all: Record<string, string> | null;
} = {
	active: null,
	all: null,
};
let _projectDetailCache: Record<string, ProjectDetail> | null = null;

type ProjectFeatureKey =
	| "cycle_view"
	| "module_view"
	| "page_view"
	| "intake_view";

const FEATURE_LABELS: Record<ProjectFeatureKey, string> = {
	cycle_view: "Cycles",
	module_view: "Modules",
	page_view: "Pages",
	intake_view: "Intake",
};

const FEATURE_HINTS: Record<ProjectFeatureKey, string> = {
	cycle_view: "Enable Cycles in the Plane project settings.",
	module_view: "Enable Modules in the Plane project settings.",
	page_view: "Enable Pages in the Plane project settings.",
	intake_view: "Enable Intake in the Plane project settings.",
};

function isProjectFeatureEnabled(
	project: ProjectDetail,
	feature: ProjectFeatureKey,
): boolean {
	if (feature === "intake_view") {
		return isProjectIntakeEnabled(project);
	}
	return project[feature];
}

function getConfiguredProject(identifier: string): string {
	const trimmed = identifier.trim();
	if (
		trimmed &&
		trimmed !== "." &&
		trimmed.toLowerCase() !== "@current" &&
		trimmed.toLowerCase() !== "@default"
	) {
		return trimmed;
	}
	const defaultProject = getConfig().defaultProject.trim();
	if (defaultProject) {
		return defaultProject;
	}
	throw new Error(
		"No default project configured. Run 'plane init', 'plane init --local', 'plane . init', 'plane projects use PROJ', or set PLANE_PROJECT.",
	);
}

/** Clear the project cache — for use in tests only */
export function _clearProjectCache(): void {
	_projectListCache = null;
	_projectCache = { active: null, all: null };
	_projectDetailCache = null;
}

function getProjects({
	includeArchived = false,
}: {
	includeArchived?: boolean;
} = {}): Effect.Effect<ReadonlyArray<Project>, Error> {
	if (_projectListCache) {
		return Effect.succeed(
			includeArchived
				? _projectListCache
				: _projectListCache.filter((project) => !isProjectArchived(project)),
		);
	}
	return Effect.gen(function* () {
		const raw = yield* api.get("projects/");
		const { results } = yield* decodeOrFail(ProjectsResponseSchema, raw);
		_projectListCache = results;
		return includeArchived
			? results
			: results.filter((project) => !isProjectArchived(project));
	});
}

function getProjectMap({
	includeArchived = true,
}: {
	includeArchived?: boolean;
} = {}): Effect.Effect<Record<string, string>, Error> {
	const cacheKey = includeArchived ? "all" : "active";
	const cached = _projectCache[cacheKey];
	if (cached) {
		return Effect.succeed(cached);
	}
	return getProjects({ includeArchived }).pipe(
		Effect.map((projects) => {
			const map = Object.fromEntries(
				projects.map((project) => [
					project.identifier.toUpperCase(),
					project.id,
				]),
			);
			_projectCache[cacheKey] = map;
			return map;
		}),
	);
}

export function listProjects({
	includeArchived = false,
}: {
	includeArchived?: boolean;
} = {}): Effect.Effect<ReadonlyArray<Project>, Error> {
	return getProjects({ includeArchived });
}

function getProjectDetail(
	projectId: string,
): Effect.Effect<ProjectDetail, Error> {
	if (_projectDetailCache?.[projectId]) {
		return Effect.succeed(_projectDetailCache[projectId]);
	}
	return Effect.gen(function* () {
		const raw = yield* api.get(`projects/${projectId}/`);
		const project = yield* decodeOrFail(ProjectDetailSchema, raw);
		_projectDetailCache ??= {};
		_projectDetailCache[projectId] = project;
		return project;
	});
}

export function getProjectFeatureDetails(projectId: string) {
	return getProjectDetail(projectId).pipe(
		Effect.map((project) => ({
			project,
			features: {
				Cycles: project.cycle_view,
				Modules: project.module_view,
				Views: project.issue_views_view,
				Pages: project.page_view,
				Intake: isProjectIntakeEnabled(project),
			},
		})),
	);
}

export function requireProjectFeature(
	projectId: string,
	feature: ProjectFeatureKey,
): Effect.Effect<void, Error> {
	return getProjectDetail(projectId).pipe(
		Effect.flatMap((project) => {
			if (isProjectFeatureEnabled(project, feature)) {
				return Effect.succeed(void 0);
			}
			const featureLabel = FEATURE_LABELS[feature];
			const featureFlag = feature === "intake_view" ? "intake_view" : feature;
			return Effect.fail(
				new Error(
					`Project ${project.identifier} has ${featureLabel} disabled (${featureFlag}=false). ${FEATURE_HINTS[feature]}`,
				),
			);
		}),
	);
}

export function resolveProject(
	identifier: string,
	options?: { includeArchived?: boolean },
): Effect.Effect<{ key: string; id: string }, Error> {
	const key = getConfiguredProject(identifier).toUpperCase();
	return getProjectMap({
		includeArchived: options?.includeArchived ?? true,
	}).pipe(
		Effect.flatMap((map) => {
			const id = map[key];
			if (!id) {
				return Effect.fail(
					new Error(
						`Unknown project: ${identifier}. Known: ${Object.keys(map).join(", ")}`,
					),
				);
			}
			return Effect.succeed({ key, id });
		}),
	);
}

export function parseIssueRef(
	ref: string,
): Effect.Effect<{ projectId: string; projKey: string; seq: number }, Error> {
	const parts = ref.toUpperCase().split("-");
	if (parts.length !== 2 || !/^\d+$/.test(parts[1])) {
		return Effect.fail(
			new Error(`Invalid issue ref: ${ref}. Expected format like PROJ-29`),
		);
	}
	const [projKey, seqStr] = parts;
	return resolveProject(projKey).pipe(
		Effect.map(({ id }) => ({
			projectId: id,
			projKey,
			seq: parseInt(seqStr, 10),
		})),
	);
}

export function findIssueBySeq(
	projectId: string,
	seq: number,
): Effect.Effect<Issue, Error> {
	return Effect.gen(function* () {
		const raw = yield* api.get(`projects/${projectId}/issues/`);
		const { results } = yield* decodeOrFail(IssuesResponseSchema, raw);
		const issue = results.find((i) => i.sequence_id === seq);
		if (!issue) return yield* Effect.fail(new Error(`Issue #${seq} not found`));
		return issue;
	});
}

export function getMemberId(
	nameEmailOrId: string,
): Effect.Effect<string, Error> {
	return Effect.gen(function* () {
		const results = yield* decodeOrFail(
			MembersResponseSchema,
			yield* api.get("members/"),
		);
		const lower = nameEmailOrId.toLowerCase();
		const member = results.find(
			(m) =>
				m.id === nameEmailOrId ||
				m.display_name.toLowerCase() === lower ||
				(m.email ?? "").toLowerCase() === lower,
		);
		if (!member)
			return yield* Effect.fail(
				new Error(`Member not found: ${nameEmailOrId}`),
			);
		return member.id;
	});
}

export function getStateId(
	projectId: string,
	nameOrGroup: string,
): Effect.Effect<string, Error> {
	return Effect.gen(function* () {
		const raw = yield* api.get(`projects/${projectId}/states/`);
		const { results } = yield* decodeOrFail(StatesResponseSchema, raw);
		const lower = nameOrGroup.toLowerCase();
		const state = results.find(
			(s) => s.group === lower || s.name.toLowerCase() === lower,
		);
		if (!state)
			return yield* Effect.fail(new Error(`State not found: ${nameOrGroup}`));
		return state.id;
	});
}

export function getLabelId(
	projectId: string,
	name: string,
): Effect.Effect<string, Error> {
	return resolveLabel(projectId, name).pipe(Effect.map((label) => label.id));
}

export function resolveLabel(
	projectId: string,
	nameOrId: string,
): Effect.Effect<{ id: string; name: string }, Error> {
	return Effect.gen(function* () {
		const raw = yield* api.get(`projects/${projectId}/labels/`);
		const { results } = yield* decodeOrFail(LabelsResponseSchema, raw);
		const lower = nameOrId.toLowerCase();
		const label = results.find(
			(l) => l.id === nameOrId || l.name.toLowerCase() === lower,
		);
		if (!label)
			return yield* Effect.fail(new Error(`Label not found: ${nameOrId}`));
		return { id: label.id, name: label.name };
	});
}

export function resolveModule(
	projectId: string,
	nameOrId: string,
): Effect.Effect<{ id: string; name: string }, Error> {
	return Effect.gen(function* () {
		const raw = yield* api.get(`projects/${projectId}/modules/`);
		const { results } = yield* decodeOrFail(ModulesResponseSchema, raw);
		const lower = nameOrId.toLowerCase();
		const module = results.find(
			(m) => m.id === nameOrId || m.name.toLowerCase() === lower,
		);
		if (!module)
			return yield* Effect.fail(new Error(`Module not found: ${nameOrId}`));
		return { id: module.id, name: module.name };
	});
}

export function resolveCycle(
	projectId: string,
	nameOrId: string,
): Effect.Effect<{ id: string; name: string }, Error> {
	return Effect.gen(function* () {
		const raw = yield* api.get(`projects/${projectId}/cycles/`);
		const { results } = yield* decodeOrFail(CyclesResponseSchema, raw);
		const lower = nameOrId.toLowerCase();
		const cycle = results.find(
			(c) => c.id === nameOrId || c.name.toLowerCase() === lower,
		);
		if (!cycle)
			return yield* Effect.fail(new Error(`Cycle not found: ${nameOrId}`));
		return { id: cycle.id, name: cycle.name };
	});
}
