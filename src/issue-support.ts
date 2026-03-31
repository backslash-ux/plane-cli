import { Effect } from "effect";

export interface IssueUpdatePayload {
	state?: string;
	priority?: string;
	name?: string;
	description_html?: string;
	assignees?: string[];
	label_ids?: string[];
}

export interface IssueCreatePayload {
	name: string;
	priority?: string;
	state?: string;
	description_html?: string;
	assignees?: string[];
	label_ids?: string[];
}

export interface WorklogPayload {
	duration: number;
	description?: string;
}

function isNotFoundError(error: Error): boolean {
	return /^HTTP 404:/.test(error.message);
}

export function requestWithFallback<A>(
	paths: ReadonlyArray<string>,
	request: (path: string) => Effect.Effect<A, Error>,
	notFoundMessage: string,
): Effect.Effect<A, Error> {
	const [current, ...rest] = paths;
	if (!current) {
		return Effect.fail(new Error(notFoundMessage));
	}
	return request(current).pipe(
		Effect.catchAll((error) => {
			if (!isNotFoundError(error)) {
				return Effect.fail(error);
			}
			if (rest.length === 0) {
				return Effect.fail(new Error(notFoundMessage));
			}
			return requestWithFallback(rest, request, notFoundMessage);
		}),
	);
}

export function issueLinkPaths(
	projectId: string,
	issueId: string,
): ReadonlyArray<string> {
	return [
		`projects/${projectId}/work-items/${issueId}/links/`,
		`projects/${projectId}/issues/${issueId}/links/`,
		`projects/${projectId}/issues/${issueId}/issue-links/`,
	];
}

export function issueWorklogPaths(
	projectId: string,
	issueId: string,
): ReadonlyArray<string> {
	return [
		`projects/${projectId}/work-items/${issueId}/worklogs/`,
		`projects/${projectId}/issues/${issueId}/worklogs/`,
		`projects/${projectId}/issues/${issueId}/issue-worklogs/`,
	];
}
