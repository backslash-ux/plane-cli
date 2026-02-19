import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

export const BASE = "http://localhost:3737";
export const WORKSPACE = "testws";

export function makeServer(...handlers: Parameters<typeof setupServer>[0][]) {
	return setupServer(...handlers);
}

export function issuesHandler(projectId: string, issues: unknown[]) {
	return http.get(
		`${BASE}/api/v1/workspaces/${WORKSPACE}/projects/${projectId}/issues/`,
		() => HttpResponse.json({ results: issues, next_page_results: false }),
	);
}

export function statesHandler(projectId: string, states: unknown[]) {
	return http.get(
		`${BASE}/api/v1/workspaces/${WORKSPACE}/projects/${projectId}/states/`,
		() => HttpResponse.json({ results: states }),
	);
}

export function projectsHandler(projects: unknown[]) {
	return http.get(`${BASE}/api/v1/workspaces/${WORKSPACE}/projects/`, () =>
		HttpResponse.json({ results: projects }),
	);
}
