import { Schema } from "effect";

// --- Schemas ---

export const StateSchema = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	group: Schema.String,
	color: Schema.optional(Schema.String),
});
export type State = typeof StateSchema.Type;

export const IssueLabelSchema = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	color: Schema.optional(Schema.NullOr(Schema.String)),
});
export type IssueLabel = typeof IssueLabelSchema.Type;

export const IssueSchema = Schema.Struct({
	id: Schema.String,
	sequence_id: Schema.Number,
	name: Schema.String,
	priority: Schema.String,
	state: Schema.Union(Schema.String, StateSchema),
	assignees: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
	description_html: Schema.optional(Schema.NullOr(Schema.String)),
	estimate_point: Schema.optional(Schema.NullOr(Schema.String)),
	start_date: Schema.optional(Schema.NullOr(Schema.String)),
	target_date: Schema.optional(Schema.NullOr(Schema.String)),
	completed_at: Schema.optional(Schema.NullOr(Schema.String)),
	created_at: Schema.optional(Schema.NullOr(Schema.String)),
	updated_at: Schema.optional(Schema.NullOr(Schema.String)),
	labels: Schema.optional(
		Schema.NullOr(Schema.Array(Schema.Union(Schema.String, IssueLabelSchema))),
	),
});
export type Issue = typeof IssueSchema.Type;

export const StatesResponseSchema = Schema.Struct({
	results: Schema.Array(StateSchema),
});

export const IssuesResponseSchema = Schema.Struct({
	results: Schema.Array(IssueSchema),
});

export const PaginatedIssuesResponseSchema = Schema.Struct({
	results: Schema.Array(IssueSchema),
	next_cursor: Schema.optional(Schema.NullOr(Schema.String)),
	next_page_results: Schema.optional(Schema.Boolean),
});

export interface StatsPeriod {
	since?: string;
	until?: string;
}

export interface StatsResult {
	project: string;
	period?: StatsPeriod;
	total_issues: number;
	by_state_group: Record<string, number>;
	by_priority: Record<string, number>;
	created_in_range: number;
	completed_in_range: number;
	assigned: number;
	unassigned: number;
}

export interface WorkspaceStatsResult {
	workspace: string;
	period?: StatsPeriod;
	total_issues: number;
	by_state_group: Record<string, number>;
	by_priority: Record<string, number>;
	created_in_range: number;
	completed_in_range: number;
	assigned: number;
	unassigned: number;
	projects: StatsResult[];
	skipped_projects?: string[];
}

export const LabelSchema = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	color: Schema.optional(Schema.NullOr(Schema.String)),
	parent: Schema.optional(Schema.NullOr(Schema.String)),
});
export type Label = typeof LabelSchema.Type;

export const LabelsResponseSchema = Schema.Struct({
	results: Schema.Array(LabelSchema),
});

// Members endpoint returns a flat array (no results wrapper)
export const MemberSchema = Schema.Struct({
	id: Schema.String,
	display_name: Schema.String,
	email: Schema.optional(Schema.NullOr(Schema.String)),
});
export type Member = typeof MemberSchema.Type;

export const MembersResponseSchema = Schema.Array(MemberSchema);

export const CycleSchema = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	status: Schema.optional(Schema.NullOr(Schema.String)),
	start_date: Schema.optional(Schema.NullOr(Schema.String)),
	end_date: Schema.optional(Schema.NullOr(Schema.String)),
	total_issues: Schema.optional(Schema.Number),
	completed_issues: Schema.optional(Schema.Number),
	cancelled_issues: Schema.optional(Schema.Number),
	started_issues: Schema.optional(Schema.Number),
	unstarted_issues: Schema.optional(Schema.Number),
	backlog_issues: Schema.optional(Schema.Number),
});
export type Cycle = typeof CycleSchema.Type;

export const CyclesResponseSchema = Schema.Struct({
	results: Schema.Array(CycleSchema),
});

export const ProjectSchema = Schema.Struct({
	id: Schema.String,
	identifier: Schema.String,
	name: Schema.String,
	description: Schema.optional(Schema.NullOr(Schema.String)),
	archived_at: Schema.optional(Schema.NullOr(Schema.String)),
});
export type Project = typeof ProjectSchema.Type;

export const ProjectDetailSchema = Schema.Struct({
	id: Schema.String,
	identifier: Schema.String,
	name: Schema.String,
	module_view: Schema.Boolean,
	cycle_view: Schema.Boolean,
	issue_views_view: Schema.Boolean,
	page_view: Schema.Boolean,
	inbox_view: Schema.optional(Schema.Boolean),
	intake_view: Schema.optional(Schema.Boolean),
	estimate: Schema.optional(Schema.NullOr(Schema.String)),
});
export type ProjectDetail = typeof ProjectDetailSchema.Type;

export function isProjectIntakeEnabled(
	project: Pick<ProjectDetail, "inbox_view" | "intake_view">,
): boolean {
	return (project.inbox_view || project.intake_view) ?? false;
}

export function isProjectArchived(
	project: Pick<Project, "archived_at">,
): boolean {
	return project.archived_at != null;
}

export const EstimateSchema = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	description: Schema.optional(Schema.NullOr(Schema.String)),
	type: Schema.String,
	last_used: Schema.optional(Schema.Boolean),
	project: Schema.String,
	workspace: Schema.String,
});
export type Estimate = typeof EstimateSchema.Type;

export const EstimatePointSchema = Schema.Struct({
	id: Schema.String,
	estimate: Schema.String,
	key: Schema.optional(Schema.Number),
	value: Schema.String,
	description: Schema.optional(Schema.NullOr(Schema.String)),
	project: Schema.String,
	workspace: Schema.String,
});
export type EstimatePoint = typeof EstimatePointSchema.Type;

export const EstimatePointsResponseSchema = Schema.Array(EstimatePointSchema);

export const ProjectsResponseSchema = Schema.Struct({
	results: Schema.Array(ProjectSchema),
});

export const ProjectsFlatResponseSchema = Schema.Array(ProjectSchema);

export const ActivitySchema = Schema.Struct({
	id: Schema.String,
	actor_detail: Schema.optional(
		Schema.Struct({
			display_name: Schema.String,
		}),
	),
	field: Schema.optional(Schema.NullOr(Schema.String)),
	old_value: Schema.optional(Schema.NullOr(Schema.String)),
	new_value: Schema.optional(Schema.NullOr(Schema.String)),
	verb: Schema.optional(Schema.String),
	created_at: Schema.String,
});
export type Activity = typeof ActivitySchema.Type;

export const ActivitiesResponseSchema = Schema.Struct({
	results: Schema.Array(ActivitySchema),
});

export const IssueLinkSchema = Schema.Struct({
	id: Schema.String,
	title: Schema.optional(Schema.NullOr(Schema.String)),
	url: Schema.String,
	created_at: Schema.String,
});
export type IssueLink = typeof IssueLinkSchema.Type;

export const IssueLinksResponseSchema = Schema.Struct({
	results: Schema.Array(IssueLinkSchema),
});

export const ModuleSchema = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	status: Schema.optional(Schema.String),
	description: Schema.optional(Schema.NullOr(Schema.String)),
	identifier: Schema.optional(Schema.String),
	created_at: Schema.optional(Schema.String),
	start_date: Schema.optional(Schema.NullOr(Schema.String)),
	target_date: Schema.optional(Schema.NullOr(Schema.String)),
});
export type Module = typeof ModuleSchema.Type;

export const ModulesResponseSchema = Schema.Struct({
	results: Schema.Array(ModuleSchema),
});

export const ModuleIssueRelationSchema = Schema.Struct({
	id: Schema.String,
	issue: Schema.String,
	issue_detail: Schema.optional(
		Schema.Struct({
			id: Schema.String,
			sequence_id: Schema.Number,
			name: Schema.String,
		}),
	),
});

export const ModuleIssueRawSchema = Schema.Struct({
	id: Schema.String,
	sequence_id: Schema.Number,
	name: Schema.String,
});

export const ModuleIssueSchema = Schema.Union(
	ModuleIssueRelationSchema,
	ModuleIssueRawSchema,
);
export type ModuleIssue = typeof ModuleIssueSchema.Type;

export const ModuleIssuesResponseSchema = Schema.Struct({
	results: Schema.Array(ModuleIssueSchema),
});

export const WorklogSchema = Schema.Struct({
	id: Schema.String,
	description: Schema.optional(Schema.NullOr(Schema.String)),
	duration: Schema.Number,
	logged_by_detail: Schema.optional(
		Schema.Struct({ display_name: Schema.String }),
	),
	created_at: Schema.String,
});
export type Worklog = typeof WorklogSchema.Type;

export const WorklogsResponseSchema = Schema.Struct({
	results: Schema.Array(WorklogSchema),
});

export const IntakeIssueSchema = Schema.Struct({
	id: Schema.String,
	issue: Schema.optional(Schema.String),
	issue_detail: Schema.optional(
		Schema.Struct({
			id: Schema.String,
			sequence_id: Schema.Number,
			name: Schema.String,
			priority: Schema.String,
		}),
	),
	status: Schema.optional(Schema.Number),
	created_at: Schema.String,
});
export type IntakeIssue = typeof IntakeIssueSchema.Type;

export const IntakeIssuesResponseSchema = Schema.Struct({
	results: Schema.Array(IntakeIssueSchema),
});

export const PageSchema = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	description_html: Schema.optional(Schema.NullOr(Schema.String)),
	created_at: Schema.String,
	updated_at: Schema.optional(Schema.NullOr(Schema.String)),
});
export type Page = typeof PageSchema.Type;

export const PagesResponseSchema = Schema.Struct({
	results: Schema.Array(PageSchema),
});

export const CommentSchema = Schema.Struct({
	id: Schema.String,
	comment_html: Schema.optional(Schema.String),
	actor_detail: Schema.optional(Schema.Struct({ display_name: Schema.String })),
	created_at: Schema.String,
});
export type Comment = typeof CommentSchema.Type;

export const CommentsResponseSchema = Schema.Struct({
	results: Schema.Array(CommentSchema),
});

export const CycleIssueRelationSchema = Schema.Struct({
	id: Schema.String,
	issue: Schema.String,
	issue_detail: Schema.optional(
		Schema.Struct({
			id: Schema.String,
			sequence_id: Schema.Number,
			name: Schema.String,
		}),
	),
});

export const CycleIssueRawSchema = Schema.Struct({
	id: Schema.String,
	sequence_id: Schema.Number,
	name: Schema.String,
});

export const CycleIssueSchema = Schema.Union(
	CycleIssueRelationSchema,
	CycleIssueRawSchema,
);
export type CycleIssue = typeof CycleIssueSchema.Type;

export const CycleIssuesResponseSchema = Schema.Struct({
	results: Schema.Array(CycleIssueSchema),
});
