import { z } from 'zod';

// Import static roadmap data generated at build time
// @ts-ignore - JSON imports are handled by webpack
import roadmapDataJson from '@site/static/data/github-roadmap.json';

// Zod schemas for roadmap data validation
const IterationSchema = z.object({
  title: z.string(),
  startDate: z.string(),
  duration: z.number(),
});

const RoadmapItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  statusColor: z.string(),
  statusTextColor: z.string(),
  category: z.enum(['governance', 'research']),
  issueNumber: z.number(),
  url: z.string(),
  projectNumber: z.number().optional(),
  projectName: z.string().optional(),
  createdAt: z.string().optional(),
  closedAt: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  quarter: z.string().nullable().optional(),
  iteration: IterationSchema.nullable().optional(),
});

const ProjectInfoSchema = z.object({
  name: z.string(),
  statuses: z.array(z.tuple([z.string(), z.string()])),
  columns: z.array(z.string()),
});

const RoadmapDataJsonSchema = z.object({
  items: z.array(RoadmapItemSchema),
  statuses: z.array(z.tuple([z.string(), z.string()])),
  columns: z.array(z.string()),
  quarters: z.array(z.string()).optional(),
  projects: z.record(z.string(), ProjectInfoSchema).optional(),
  lastUpdated: z.string(),
});

// Type inference from Zod schemas
type RoadmapDataJson = z.infer<typeof RoadmapDataJsonSchema>;

// Export types inferred from Zod schemas
export type RoadmapItem = z.infer<typeof RoadmapItemSchema>;
export type Iteration = z.infer<typeof IterationSchema>;

// GitHub API types (for the dynamic fetch function)
export interface GitHubProjectItem {
  id: string;
  content: {
    __typename: string;
    title?: string;
    number?: number;
    state?: string;
    url?: string;
    labels?: {
      nodes: Array<{
        name: string;
        color: string;
      }>;
    };
  };
  fieldValues: {
    nodes: Array<{
      __typename: string;
      name?: string;
      date?: string;
      title?: string;
      startDate?: string;
      duration?: number;
      field?: {
        name: string;
      };
    }>;
  };
}

export interface GitHubProjectData {
  items: RoadmapItem[];
  statuses: Map<string, string>; // status name -> color
  columns: string[]; // ordered list of column names
  quarters?: string[]; // ordered list of quarters
  projects?: Record<number, {
    name: string;
    statuses: Array<[string, string]>;
    columns: string[];
  }>;
  error?: string;
}

const GITHUB_GRAPHQL_API = 'https://api.github.com/graphql';
const ORG_NAME = 'houseofstake';
const PROJECT_NUMBER = 1;

// Project configuration
export const PROJECTS_CONFIG = [
  {
    number: 1,
    name: 'Governance & Product',
    category: 'governance',
    icon: '/img/governance-icon.svg',
  },
  {
    number: 2,
    name: 'AI & Research',
    category: 'research',
    icon: '/img/research-icon.svg',
  },
];

// Map project numbers to their configs
export const PROJECT_MAP = Object.fromEntries(
  PROJECTS_CONFIG.map(p => [p.number, p])
);

// Hardcoded colors for kanban states (matching Figma design)
const KANBAN_STATE_COLORS: Record<string, string> = {
  Todo: '#E2E8F0', // Light slate gray
  'Next Sprint/On Deck': '#E9D5FF', // Light purple
  'This Sprint': '#BAE6FD', // Light sky blue
  'Paused/Blocked': '#FED7AA', // Light amber/orange
  Done: '#C7F5D8', // Light green from Figma
};

// Text colors for each status badge
const KANBAN_TEXT_COLORS: Record<string, string> = {
  Todo: '#475569', // Dark slate gray
  'Next Sprint/On Deck': '#6B21A8', // Dark purple
  'This Sprint': '#0369A1', // Dark sky blue
  'Paused/Blocked': '#C2410C', // Dark amber/orange
  Done: '#096D50', // Dark green from Figma
};

// Get project data from static JSON file (fetched at build time)
export function getStaticProjectData(): GitHubProjectData {
  try {
    // Validate JSON data with Zod - will throw with detailed errors if invalid
    const validatedData = RoadmapDataJsonSchema.parse(roadmapDataJson);
    
    // Convert statuses array to Map
    const statuses = new Map<string, string>();
    validatedData.statuses.forEach(([key, value]) => {
      statuses.set(key, value);
    });
    
    // Convert number keys to numbers for projects if needed
    const projects = validatedData.projects ? 
      Object.fromEntries(
        Object.entries(validatedData.projects).map(([key, value]) => [
          parseInt(key, 10),
          value
        ])
      ) : undefined;

    return {
      items: validatedData.items,
      statuses,
      columns: validatedData.columns,
      quarters: validatedData.quarters,
      projects: projects as Record<number, {
        name: string;
        statuses: Array<[string, string]>;
        columns: string[];
      }> | undefined,
    };
  } catch (error) {
    // Zod errors have detailed information about what failed
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map(err => 
        `${err.path.join('.')}: ${err.message}`
      ).join('\n');
      console.error('FATAL: Invalid roadmap data structure:\n', errorMessages);
      throw new Error(`Invalid roadmap data:\n${errorMessages}`);
    }
    
    // Re-throw other errors
    console.error('FATAL: Failed to load roadmap data:', error);
    throw error;
  }
}

// Export the static data function as the default data provider
export const getHardcodedProjectData = getStaticProjectData;

// Dynamic fetch function (kept for reference but should not be used in production)
// This function would expose the GitHub token in the browser
export async function fetchGitHubProjectData(): Promise<GitHubProjectData> {
  console.warn('Dynamic GitHub fetching is disabled for security reasons.');
  console.warn('Use build-time data fetching instead.');
  return getStaticProjectData();
}

// Transform project items from GraphQL to roadmap format
function transformProjectItems(
  items: GitHubProjectItem[],
  statuses: Map<string, string>
): RoadmapItem[] {
  return items
    .filter(
      (item) =>
        item.content &&
        (item.content.__typename === 'Issue' ||
          item.content.__typename === 'PullRequest')
    )
    .map((item) => {
      const content = item.content;

      // Get status from field values
      let status = 'Todo'; // default
      let statusColor =
        statuses.get(status) || KANBAN_STATE_COLORS['Todo'] || '#E2E8F0';
      let statusTextColor = KANBAN_TEXT_COLORS[status] || '#475569';

      const statusField = item.fieldValues.nodes.find(
        (field) =>
          field.__typename === 'ProjectV2ItemFieldSingleSelectValue' &&
          field.field?.name === 'Status'
      );

      if (statusField && statusField.name) {
        status = statusField.name;
        statusColor =
          statuses.get(status) || KANBAN_STATE_COLORS[status] || '#E2E8F0';
        statusTextColor = KANBAN_TEXT_COLORS[status] || '#475569';
      }

      // Determine category from labels
      const category = content.labels?.nodes.some((label) =>
        ['research', 'ai', 'ml', 'machine learning'].includes(
          label.name.toLowerCase()
        )
      )
        ? 'research'
        : 'governance';

      return {
        id: item.id,
        title: content.title || 'Untitled',
        status,
        statusColor,
        statusTextColor,
        category,
        issueNumber: content.number || 0,
        url: content.url || '#',
      };
    });
}