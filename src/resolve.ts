import { Effect } from "effect";
import { api, decodeOrFail } from "./api.js";
import {
	EstimatesResponseSchema,
	IssuesResponseSchema,
	LabelsResponseSchema,
	MembersResponseSchema,
	ProjectsResponseSchema,
	StatesResponseSchema,
} from "./config.js";

// Cache project list within a process invocation
let _projectCache: Record<string, string> | null = null;

/** Clear the project cache — for use in tests only */
export function _clearProjectCache() {
	_projectCache = null;
}

function getProjectMap(): Effect.Effect<Record<string, string>, Error> {
	if (_projectCache) return Effect.succeed(_projectCache);
	return Effect.gen(function* () {
		const raw = yield* api.get("projects/");
		const { results } = yield* decodeOrFail(ProjectsResponseSchema, raw);
		_projectCache = Object.fromEntries(
			results.map((p) => [p.identifier.toUpperCase(), p.id]),
		);
		return _projectCache;
	});
}

export function resolveProject(
	identifier: string,
): Effect.Effect<{ key: string; id: string }, Error> {
	const key = identifier.toUpperCase();
	return getProjectMap().pipe(
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

export function findIssueBySeq(projectId: string, seq: number) {
	return Effect.gen(function* () {
		const raw = yield* api.get(`projects/${projectId}/issues/`);
		const { results } = yield* decodeOrFail(IssuesResponseSchema, raw);
		const issue = results.find((i) => i.sequence_id === seq);
		if (!issue) return yield* Effect.fail(new Error(`Issue #${seq} not found`));
		return issue;
	});
}

export function getMemberId(nameEmailOrId: string) {
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

export function getStateId(projectId: string, nameOrGroup: string) {
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

export function getEstimatePointId(projectId: string, value: string) {
	return Effect.gen(function* () {
		const raw = yield* api.get(`projects/${projectId}/estimates/`);
		const { results } = yield* decodeOrFail(EstimatesResponseSchema, raw);
		if (results.length === 0)
			return yield* Effect.fail(
				new Error("No estimate scheme configured for this project"),
			);
		const points = results[0].points;
		const lower = value.toLowerCase();
		const point = points.find(
			(p) => p.value.toLowerCase() === lower || String(p.key) === value,
		);
		if (!point)
			return yield* Effect.fail(
				new Error(
					`Estimate point not found: ${value}. Available: ${points.map((p) => p.value).join(", ")}`,
				),
			);
		return point.id;
	});
}

export function getLabelId(projectId: string, name: string) {
	return Effect.gen(function* () {
		const raw = yield* api.get(`projects/${projectId}/labels/`);
		const { results } = yield* decodeOrFail(LabelsResponseSchema, raw);
		const lower = name.toLowerCase();
		const label = results.find((l) => l.name.toLowerCase() === lower);
		if (!label)
			return yield* Effect.fail(new Error(`Label not found: ${name}`));
		return label.id;
	});
}
