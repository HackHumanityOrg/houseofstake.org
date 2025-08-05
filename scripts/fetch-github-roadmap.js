const fs = require('fs');
const path = require('path');
const https = require('https');
const { z } = require('zod');

// GitHub API configuration
const GITHUB_GRAPHQL_API = 'https://api.github.com/graphql';
const ORG_NAME = 'houseofstake';

// Project configuration
const PROJECTS = [
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

// Hardcoded colors for kanban states (matching Figma design)
const KANBAN_STATE_COLORS = {
  'Todo': '#E2E8F0',
  'Next Sprint/On Deck': '#E9D5FF',
  'This Sprint': '#BAE6FD',
  'Paused/Blocked': '#FED7AA',
  'Done': '#C7F5D8',
};

// Text colors for each status badge
const KANBAN_TEXT_COLORS = {
  'Todo': '#475569',
  'Next Sprint/On Deck': '#6B21A8',
  'This Sprint': '#0369A1',
  'Paused/Blocked': '#C2410C',
  'Done': '#096D50',
};

// GraphQL query to fetch project data with date fields
const query = `
  query($org: String!, $projectNumber: Int!) {
    organization(login: $org) {
      projectV2(number: $projectNumber) {
        id
        title
        items(first: 100) {
          nodes {
            id
            content {
              __typename
              ... on Issue {
                title
                number
                state
                url
                createdAt
                closedAt
                labels(first: 10) {
                  nodes {
                    name
                    color
                  }
                }
              }
              ... on PullRequest {
                title
                number
                state
                url
                createdAt
                closedAt
                labels(first: 10) {
                  nodes {
                    name
                    color
                  }
                }
              }
            }
            fieldValues(first: 20) {
              nodes {
                __typename
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                  field {
                    ... on ProjectV2SingleSelectField {
                      name
                    }
                  }
                }
                ... on ProjectV2ItemFieldDateValue {
                  date
                  field {
                    ... on ProjectV2Field {
                      name
                    }
                  }
                }
                ... on ProjectV2ItemFieldIterationValue {
                  title
                  startDate
                  duration
                  field {
                    ... on ProjectV2IterationField {
                      name
                    }
                  }
                }
              }
            }
          }
        }
        fields(first: 20) {
          nodes {
            __typename
            ... on ProjectV2SingleSelectField {
              id
              name
              options {
                id
                name
                color
              }
            }
            ... on ProjectV2Field {
              id
              name
            }
            ... on ProjectV2IterationField {
              id
              name
              configuration {
                iterations {
                  id
                  title
                  startDate
                  duration
                }
              }
            }
          }
        }
      }
    }
  }
`;

// Helper function to get quarter from date
function getQuarterFromDate(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  const month = date.getMonth();
  const year = date.getFullYear();
  const quarter = Math.floor(month / 3) + 1;
  return `Q${quarter} ${year}`;
}

// Helper function to extract date fields from field values
function extractDateFields(fieldValues) {
  const dates = {
    startDate: null,
    endDate: null,
    dueDate: null,
    quarter: null,
    iteration: null,
  };

  fieldValues.nodes.forEach((field) => {
    if (field.__typename === 'ProjectV2ItemFieldDateValue' && field.date) {
      const fieldName = field.field?.name?.toLowerCase() || '';
      if (fieldName.includes('start')) {
        dates.startDate = field.date;
      } else if (fieldName.includes('end') || fieldName.includes('due')) {
        dates.endDate = field.date;
        dates.dueDate = field.date;
      }
    } else if (field.__typename === 'ProjectV2ItemFieldIterationValue') {
      dates.iteration = {
        title: field.title,
        startDate: field.startDate,
        duration: field.duration,
      };
      // Use iteration start date if no explicit start date
      if (!dates.startDate && field.startDate) {
        dates.startDate = field.startDate;
      }
    }
  });

  // Determine quarter based on available dates
  if (dates.startDate) {
    dates.quarter = getQuarterFromDate(dates.startDate);
  } else if (dates.endDate) {
    dates.quarter = getQuarterFromDate(dates.endDate);
  } else if (dates.iteration?.startDate) {
    dates.quarter = getQuarterFromDate(dates.iteration.startDate);
  }

  return dates;
}

// Transform project items from GraphQL to roadmap format
function transformProjectItems(items, statusesMap, projectConfig) {
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
      let statusColor = statusesMap.get(status) || KANBAN_STATE_COLORS['Todo'] || '#E2E8F0';
      let statusTextColor = KANBAN_TEXT_COLORS[status] || '#475569';

      const statusField = item.fieldValues.nodes.find(
        (field) =>
          field.__typename === 'ProjectV2ItemFieldSingleSelectValue' &&
          field.field?.name === 'Status'
      );

      if (statusField && statusField.name) {
        status = statusField.name;
        statusColor = statusesMap.get(status) || KANBAN_STATE_COLORS[status] || '#E2E8F0';
        statusTextColor = KANBAN_TEXT_COLORS[status] || '#475569';
      }

      // Extract date fields
      const dates = extractDateFields(item.fieldValues);

      // Use project category
      const category = projectConfig.category;

      return {
        id: item.id,
        title: content.title || 'Untitled',
        status,
        statusColor,
        statusTextColor,
        category,
        issueNumber: content.number || 0,
        url: content.url || '#',
        projectNumber: projectConfig.number,
        projectName: projectConfig.name,
        createdAt: content.createdAt,
        closedAt: content.closedAt,
        startDate: dates.startDate,
        endDate: dates.endDate,
        dueDate: dates.dueDate,
        quarter: dates.quarter,
        iteration: dates.iteration,
      };
    });
}

// Fetch data from GitHub GraphQL API
async function fetchGitHubData(token, projectNumber) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      query,
      variables: {
        org: ORG_NAME,
        projectNumber: projectNumber,
      },
    });

    const options = {
      hostname: 'api.github.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'HouseOfStake-BuildScript',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Fetch data for a single project
async function fetchProjectData(token, projectConfig) {
  try {
    const response = await fetchGitHubData(token, projectConfig.number);

    if (response.errors) {
      throw new Error(response.errors[0].message);
    }

    const project = response.data?.organization?.projectV2;
    if (!project) {
      throw new Error(`Project ${projectConfig.number} not found`);
    }

    // Extract status field and its options
    const statusField = project.fields.nodes.find(
      (field) =>
        field.__typename === 'ProjectV2SingleSelectField' &&
        field.name === 'Status'
    );

    const statuses = new Map();
    const columns = [];

    if (statusField && statusField.options) {
      statusField.options.forEach((option) => {
        // Use hardcoded color for known states, fallback to a default gray
        const color = KANBAN_STATE_COLORS[option.name] || '#94A3B8';
        statuses.set(option.name, color);
        columns.push(option.name);
      });
    }

    // If no columns found, use default kanban states
    if (columns.length === 0) {
      Object.entries(KANBAN_STATE_COLORS).forEach(([state, color]) => {
        statuses.set(state, color);
        columns.push(state);
      });
    }

    // Transform project items to roadmap items
    const items = transformProjectItems(project.items.nodes, statuses, projectConfig);

    return {
      projectNumber: projectConfig.number,
      projectName: projectConfig.name,
      items,
      statuses: Array.from(statuses.entries()),
      columns,
    };
  } catch (error) {
    console.error(`Error fetching project ${projectConfig.number}:`, error.message);
    return null;
  }
}

// Get all unique quarters from items
function getUniqueQuarters(items) {
  const quarters = new Set();
  const currentYear = new Date().getFullYear();
  
  items.forEach((item) => {
    if (item.quarter) {
      quarters.add(item.quarter);
    }
  });

  // Add current and next few quarters if not enough data
  if (quarters.size < 4) {
    const currentQuarter = Math.floor(new Date().getMonth() / 3) + 1;
    for (let i = 0; i < 4; i++) {
      const q = ((currentQuarter - 1 + i) % 4) + 1;
      const y = currentYear + Math.floor((currentQuarter - 1 + i) / 4);
      quarters.add(`Q${q} ${y}`);
    }
  }

  // Sort quarters
  return Array.from(quarters).sort((a, b) => {
    const [qA, yA] = a.split(' ');
    const [qB, yB] = b.split(' ');
    const yearDiff = parseInt(yA) - parseInt(yB);
    if (yearDiff !== 0) return yearDiff;
    return parseInt(qA.substring(1)) - parseInt(qB.substring(1));
  });
}

// Main function
async function main() {
  const token = process.env.GITHUB_TOKEN;
  
  if (!token) {
    console.error('Error: GITHUB_TOKEN environment variable is not set');
    console.error('Please set GITHUB_TOKEN to fetch roadmap data from GitHub');
    process.exit(1);
  }

  console.log('Fetching GitHub project data...');

  try {
    // Fetch data for all projects
    const projectsData = await Promise.all(
      PROJECTS.map((project) => fetchProjectData(token, project))
    );

    // Filter out any failed fetches
    const validProjects = projectsData.filter((data) => data !== null);

    if (validProjects.length === 0) {
      throw new Error('Failed to fetch data for any projects');
    }

    // Combine all items from all projects
    const allItems = [];
    const projectsInfo = {};

    validProjects.forEach((projectData) => {
      allItems.push(...projectData.items);
      projectsInfo[projectData.projectNumber] = {
        name: projectData.projectName,
        statuses: projectData.statuses,
        columns: projectData.columns,
      };
    });

    // Use the statuses from the first project as the default
    const defaultStatuses = validProjects[0].statuses;
    const defaultColumns = validProjects[0].columns;

    // Get unique quarters from all items
    const quarters = getUniqueQuarters(allItems);

    // Define Zod schemas for validation
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

    // Validate items individually and filter out invalid ones
    const validatedItems = [];
    const invalidItems = [];
    
    allItems.forEach((item, index) => {
      try {
        const validated = RoadmapItemSchema.parse(item);
        validatedItems.push(validated);
      } catch (error) {
        if (error instanceof z.ZodError) {
          const errors = error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          invalidItems.push(`Item ${index} (${item.title || 'unknown'}): ${errors}`);
        }
      }
    });

    if (invalidItems.length > 0) {
      console.warn(`⚠️  Skipped ${invalidItems.length} invalid items:`);
      invalidItems.forEach(msg => console.warn(`  - ${msg}`));
    }

    if (validatedItems.length === 0) {
      throw new Error('No valid items found after validation');
    }

    // Prepare data to save
    const roadmapData = {
      items: validatedItems,
      statuses: defaultStatuses,
      columns: defaultColumns,
      quarters: quarters,
      projects: projectsInfo,
      lastUpdated: new Date().toISOString(),
    };

    // Validate the entire data structure before saving
    try {
      RoadmapDataJsonSchema.parse(roadmapData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.issues.map(err => 
          `${err.path.join('.')}: ${err.message}`
        ).join('\n');
        throw new Error(`Invalid roadmap data structure:\n${errorMessages}`);
      }
      throw error;
    }

    // Create static directory if it doesn't exist
    const staticDir = path.join(__dirname, '..', 'static', 'data');
    if (!fs.existsSync(staticDir)) {
      fs.mkdirSync(staticDir, { recursive: true });
    }

    // Write data to JSON file
    const outputPath = path.join(staticDir, 'github-roadmap.json');
    fs.writeFileSync(outputPath, JSON.stringify(roadmapData, null, 2));

    console.log(`✅ Successfully fetched ${validatedItems.length} roadmap items from ${validProjects.length} projects`);
    console.log(`📁 Data saved to: ${outputPath}`);
  } catch (error) {
    console.error('❌ Error fetching GitHub data:', error.message);
    process.exit(1);
  }
}

// Run the script
main();