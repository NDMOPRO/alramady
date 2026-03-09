import { logger } from '../utils/logger';

export type ReportCategory =
  | 'Financial'
  | 'Sales'
  | 'HR'
  | 'Operations'
  | 'Compliance'
  | 'Marketing'
  | 'IT'
  | 'Executive';

export interface ReportTypeDefinition {
  id: string;
  name: string;
  description: string;
  category: ReportCategory;
  defaultTemplate: {
    sections: SectionTemplate[];
  };
  chartTypes: string[];
  requiredFields: string[];
  optionalFields: string[];
}

export interface SectionTemplate {
  id: string;
  title: string;
  type: 'text' | 'chart' | 'table' | 'image' | 'pagebreak' | 'summary' | 'kpi';
  order: number;
}

const REPORT_TYPES: ReportTypeDefinition[] = [
  // ── Financial ──
  {
    id: 'financial-summary',
    name: 'Financial Summary',
    description: 'High-level overview of financial performance across all accounts and departments.',
    category: 'Financial',
    defaultTemplate: {
      sections: [
        { id: 'exec-overview', title: 'Executive Overview', type: 'text', order: 1 },
        { id: 'revenue-chart', title: 'Revenue Trend', type: 'chart', order: 2 },
        { id: 'expense-table', title: 'Expense Breakdown', type: 'table', order: 3 },
        { id: 'net-income', title: 'Net Income Summary', type: 'summary', order: 4 },
      ],
    },
    chartTypes: ['bar', 'line', 'pie', 'waterfall'],
    requiredFields: ['revenue', 'expenses', 'period', 'department'],
    optionalFields: ['costCenter', 'notes', 'currency'],
  },
  {
    id: 'financial-balance-sheet',
    name: 'Balance Sheet',
    description: 'Statement of assets, liabilities, and equity at a specific point in time.',
    category: 'Financial',
    defaultTemplate: {
      sections: [
        { id: 'assets', title: 'Assets', type: 'table', order: 1 },
        { id: 'liabilities', title: 'Liabilities', type: 'table', order: 2 },
        { id: 'equity', title: 'Shareholders Equity', type: 'table', order: 3 },
        { id: 'balance-summary', title: 'Balance Summary', type: 'summary', order: 4 },
      ],
    },
    chartTypes: ['bar', 'stacked-bar', 'waterfall'],
    requiredFields: ['assets', 'liabilities', 'equity', 'reportDate'],
    optionalFields: ['comparativePeriod', 'auditorNotes'],
  },
  {
    id: 'financial-cashflow',
    name: 'Cash Flow Statement',
    description: 'Tracks cash inflows and outflows from operating, investing, and financing activities.',
    category: 'Financial',
    defaultTemplate: {
      sections: [
        { id: 'operating', title: 'Operating Activities', type: 'table', order: 1 },
        { id: 'investing', title: 'Investing Activities', type: 'table', order: 2 },
        { id: 'financing', title: 'Financing Activities', type: 'table', order: 3 },
        { id: 'cashflow-chart', title: 'Cash Flow Trend', type: 'chart', order: 4 },
        { id: 'net-change', title: 'Net Change in Cash', type: 'summary', order: 5 },
      ],
    },
    chartTypes: ['waterfall', 'line', 'bar'],
    requiredFields: ['operatingCash', 'investingCash', 'financingCash', 'period'],
    optionalFields: ['openingBalance', 'closingBalance', 'currency'],
  },
  {
    id: 'financial-profit-loss',
    name: 'Profit & Loss Statement',
    description: 'Income statement showing revenues, costs, and expenses over a reporting period.',
    category: 'Financial',
    defaultTemplate: {
      sections: [
        { id: 'revenue-section', title: 'Revenue', type: 'table', order: 1 },
        { id: 'cogs', title: 'Cost of Goods Sold', type: 'table', order: 2 },
        { id: 'gross-profit', title: 'Gross Profit', type: 'summary', order: 3 },
        { id: 'operating-expenses', title: 'Operating Expenses', type: 'table', order: 4 },
        { id: 'net-profit', title: 'Net Profit', type: 'summary', order: 5 },
        { id: 'pl-chart', title: 'P&L Trend', type: 'chart', order: 6 },
      ],
    },
    chartTypes: ['bar', 'line', 'waterfall', 'stacked-bar'],
    requiredFields: ['revenue', 'cogs', 'operatingExpenses', 'period'],
    optionalFields: ['taxRate', 'interestExpense', 'depreciation', 'otherIncome'],
  },
  {
    id: 'financial-budget-variance',
    name: 'Budget Variance Report',
    description: 'Compares actual financial performance against budgeted amounts to identify variances.',
    category: 'Financial',
    defaultTemplate: {
      sections: [
        { id: 'variance-overview', title: 'Variance Overview', type: 'summary', order: 1 },
        { id: 'variance-table', title: 'Line-Item Variances', type: 'table', order: 2 },
        { id: 'variance-chart', title: 'Variance Chart', type: 'chart', order: 3 },
        { id: 'commentary', title: 'Variance Commentary', type: 'text', order: 4 },
      ],
    },
    chartTypes: ['bar', 'grouped-bar', 'bullet'],
    requiredFields: ['budgetAmount', 'actualAmount', 'category', 'period'],
    optionalFields: ['department', 'varianceThreshold', 'notes'],
  },

  // ── Sales ──
  {
    id: 'sales-pipeline',
    name: 'Sales Pipeline Report',
    description: 'Visualises the sales pipeline across stages, showing deal counts and values.',
    category: 'Sales',
    defaultTemplate: {
      sections: [
        { id: 'pipeline-overview', title: 'Pipeline Overview', type: 'summary', order: 1 },
        { id: 'pipeline-funnel', title: 'Pipeline Funnel', type: 'chart', order: 2 },
        { id: 'deals-table', title: 'Deals by Stage', type: 'table', order: 3 },
        { id: 'forecast-section', title: 'Weighted Forecast', type: 'summary', order: 4 },
      ],
    },
    chartTypes: ['funnel', 'bar', 'stacked-bar', 'pie'],
    requiredFields: ['dealName', 'stage', 'value', 'probability'],
    optionalFields: ['owner', 'expectedCloseDate', 'source', 'product'],
  },
  {
    id: 'sales-performance',
    name: 'Sales Performance Report',
    description: 'Measures individual and team sales performance against quotas and targets.',
    category: 'Sales',
    defaultTemplate: {
      sections: [
        { id: 'kpi-cards', title: 'Key Metrics', type: 'kpi', order: 1 },
        { id: 'performance-chart', title: 'Performance vs Target', type: 'chart', order: 2 },
        { id: 'rep-table', title: 'Rep Breakdown', type: 'table', order: 3 },
        { id: 'leaderboard', title: 'Leaderboard', type: 'table', order: 4 },
      ],
    },
    chartTypes: ['bar', 'grouped-bar', 'gauge', 'line'],
    requiredFields: ['repName', 'salesAmount', 'quota', 'period'],
    optionalFields: ['team', 'region', 'product', 'closedDeals'],
  },
  {
    id: 'sales-forecast',
    name: 'Sales Forecast Report',
    description: 'Projects future sales revenue based on pipeline data and historical trends.',
    category: 'Sales',
    defaultTemplate: {
      sections: [
        { id: 'forecast-summary', title: 'Forecast Summary', type: 'summary', order: 1 },
        { id: 'forecast-chart', title: 'Forecast Projection', type: 'chart', order: 2 },
        { id: 'scenario-table', title: 'Scenario Analysis', type: 'table', order: 3 },
        { id: 'assumptions', title: 'Key Assumptions', type: 'text', order: 4 },
      ],
    },
    chartTypes: ['line', 'area', 'bar'],
    requiredFields: ['historicalRevenue', 'period', 'forecastPeriods'],
    optionalFields: ['pipelineValue', 'winRate', 'seasonalityFactor', 'growthRate'],
  },
  {
    id: 'sales-territory',
    name: 'Sales Territory Report',
    description: 'Analyses sales performance segmented by geographic territory or market region.',
    category: 'Sales',
    defaultTemplate: {
      sections: [
        { id: 'territory-map', title: 'Territory Map', type: 'chart', order: 1 },
        { id: 'territory-table', title: 'Territory Breakdown', type: 'table', order: 2 },
        { id: 'comparison-chart', title: 'Territory Comparison', type: 'chart', order: 3 },
        { id: 'territory-summary', title: 'Summary', type: 'summary', order: 4 },
      ],
    },
    chartTypes: ['map', 'bar', 'treemap', 'pie'],
    requiredFields: ['territory', 'salesAmount', 'period'],
    optionalFields: ['repCount', 'dealCount', 'targetAmount', 'growthRate'],
  },

  // ── HR ──
  {
    id: 'hr-headcount',
    name: 'Headcount Report',
    description: 'Tracks total employee headcount across departments, locations, and employment types.',
    category: 'HR',
    defaultTemplate: {
      sections: [
        { id: 'headcount-summary', title: 'Headcount Summary', type: 'kpi', order: 1 },
        { id: 'dept-breakdown', title: 'Department Breakdown', type: 'table', order: 2 },
        { id: 'headcount-trend', title: 'Headcount Trend', type: 'chart', order: 3 },
        { id: 'location-chart', title: 'By Location', type: 'chart', order: 4 },
      ],
    },
    chartTypes: ['bar', 'pie', 'line', 'treemap'],
    requiredFields: ['department', 'headcount', 'period'],
    optionalFields: ['location', 'employmentType', 'level', 'gender'],
  },
  {
    id: 'hr-attendance',
    name: 'Attendance Report',
    description: 'Monitors employee attendance, absenteeism rates, and leave utilisation.',
    category: 'HR',
    defaultTemplate: {
      sections: [
        { id: 'attendance-kpi', title: 'Attendance KPIs', type: 'kpi', order: 1 },
        { id: 'attendance-table', title: 'Attendance Details', type: 'table', order: 2 },
        { id: 'absence-chart', title: 'Absence Trends', type: 'chart', order: 3 },
        { id: 'leave-summary', title: 'Leave Summary', type: 'summary', order: 4 },
      ],
    },
    chartTypes: ['bar', 'line', 'heatmap', 'pie'],
    requiredFields: ['employeeId', 'date', 'status', 'department'],
    optionalFields: ['leaveType', 'hoursWorked', 'shift', 'manager'],
  },
  {
    id: 'hr-turnover',
    name: 'Employee Turnover Report',
    description: 'Analyses employee attrition rates, reasons for leaving, and retention trends.',
    category: 'HR',
    defaultTemplate: {
      sections: [
        { id: 'turnover-kpi', title: 'Turnover KPIs', type: 'kpi', order: 1 },
        { id: 'turnover-trend', title: 'Turnover Trend', type: 'chart', order: 2 },
        { id: 'reasons-chart', title: 'Exit Reasons', type: 'chart', order: 3 },
        { id: 'dept-table', title: 'Turnover by Department', type: 'table', order: 4 },
        { id: 'retention-analysis', title: 'Retention Analysis', type: 'text', order: 5 },
      ],
    },
    chartTypes: ['line', 'bar', 'pie', 'donut'],
    requiredFields: ['department', 'separations', 'headcount', 'period'],
    optionalFields: ['exitReason', 'tenure', 'voluntaryFlag', 'replacementCost'],
  },
  {
    id: 'hr-payroll',
    name: 'Payroll Summary Report',
    description: 'Summarises payroll costs including salaries, benefits, taxes, and overtime.',
    category: 'HR',
    defaultTemplate: {
      sections: [
        { id: 'payroll-summary', title: 'Payroll Summary', type: 'summary', order: 1 },
        { id: 'cost-breakdown', title: 'Cost Breakdown', type: 'table', order: 2 },
        { id: 'payroll-trend', title: 'Payroll Trend', type: 'chart', order: 3 },
        { id: 'dept-costs', title: 'Department Costs', type: 'chart', order: 4 },
      ],
    },
    chartTypes: ['bar', 'stacked-bar', 'pie', 'line'],
    requiredFields: ['department', 'baseSalary', 'benefits', 'period'],
    optionalFields: ['overtime', 'bonuses', 'taxes', 'deductions', 'currency'],
  },

  // ── Operations ──
  {
    id: 'project-status',
    name: 'Project Status Report',
    description: 'Provides a snapshot of project health including milestones, risks, and progress.',
    category: 'Operations',
    defaultTemplate: {
      sections: [
        { id: 'status-overview', title: 'Status Overview', type: 'kpi', order: 1 },
        { id: 'milestone-table', title: 'Milestones', type: 'table', order: 2 },
        { id: 'progress-chart', title: 'Progress Chart', type: 'chart', order: 3 },
        { id: 'risks-issues', title: 'Risks & Issues', type: 'table', order: 4 },
        { id: 'next-steps', title: 'Next Steps', type: 'text', order: 5 },
      ],
    },
    chartTypes: ['gantt', 'bar', 'gauge', 'pie'],
    requiredFields: ['projectName', 'status', 'percentComplete', 'dueDate'],
    optionalFields: ['owner', 'budget', 'actualSpend', 'priority', 'phase'],
  },
  {
    id: 'project-timeline',
    name: 'Project Timeline Report',
    description: 'Gantt-style timeline view of project tasks, dependencies, and deadlines.',
    category: 'Operations',
    defaultTemplate: {
      sections: [
        { id: 'timeline-chart', title: 'Project Timeline', type: 'chart', order: 1 },
        { id: 'tasks-table', title: 'Task Details', type: 'table', order: 2 },
        { id: 'dependencies', title: 'Dependencies', type: 'table', order: 3 },
        { id: 'critical-path', title: 'Critical Path', type: 'summary', order: 4 },
      ],
    },
    chartTypes: ['gantt', 'timeline', 'bar'],
    requiredFields: ['taskName', 'startDate', 'endDate', 'assignee'],
    optionalFields: ['dependencies', 'percentComplete', 'milestone', 'phase'],
  },
  {
    id: 'project-risk',
    name: 'Project Risk Report',
    description: 'Identifies, categorises, and tracks project risks with mitigation strategies.',
    category: 'Operations',
    defaultTemplate: {
      sections: [
        { id: 'risk-summary', title: 'Risk Summary', type: 'kpi', order: 1 },
        { id: 'risk-matrix', title: 'Risk Matrix', type: 'chart', order: 2 },
        { id: 'risk-register', title: 'Risk Register', type: 'table', order: 3 },
        { id: 'mitigation', title: 'Mitigation Plans', type: 'text', order: 4 },
      ],
    },
    chartTypes: ['heatmap', 'scatter', 'bar', 'bubble'],
    requiredFields: ['riskName', 'probability', 'impact', 'status'],
    optionalFields: ['owner', 'mitigationPlan', 'category', 'residualRisk', 'dueDate'],
  },

  // ── Compliance ──
  {
    id: 'compliance-audit',
    name: 'Audit Report',
    description: 'Documents audit findings, observations, and corrective actions.',
    category: 'Compliance',
    defaultTemplate: {
      sections: [
        { id: 'audit-scope', title: 'Audit Scope', type: 'text', order: 1 },
        { id: 'findings-table', title: 'Findings', type: 'table', order: 2 },
        { id: 'severity-chart', title: 'Findings by Severity', type: 'chart', order: 3 },
        { id: 'corrective-actions', title: 'Corrective Actions', type: 'table', order: 4 },
        { id: 'conclusion', title: 'Conclusion', type: 'text', order: 5 },
      ],
    },
    chartTypes: ['bar', 'pie', 'donut', 'gauge'],
    requiredFields: ['findingId', 'description', 'severity', 'status'],
    optionalFields: ['auditor', 'auditDate', 'correctiveAction', 'dueDate', 'area'],
  },
  {
    id: 'compliance-regulatory',
    name: 'Regulatory Compliance Report',
    description: 'Tracks compliance status against regulatory requirements and frameworks.',
    category: 'Compliance',
    defaultTemplate: {
      sections: [
        { id: 'compliance-score', title: 'Compliance Score', type: 'kpi', order: 1 },
        { id: 'regulation-table', title: 'Requirement Status', type: 'table', order: 2 },
        { id: 'compliance-chart', title: 'Compliance Trend', type: 'chart', order: 3 },
        { id: 'gaps', title: 'Gap Analysis', type: 'table', order: 4 },
        { id: 'action-plan', title: 'Action Plan', type: 'text', order: 5 },
      ],
    },
    chartTypes: ['gauge', 'bar', 'line', 'heatmap'],
    requiredFields: ['requirementId', 'regulation', 'complianceStatus', 'dueDate'],
    optionalFields: ['owner', 'evidence', 'lastAuditDate', 'riskLevel', 'framework'],
  },
  {
    id: 'compliance-sla',
    name: 'SLA Compliance Report',
    description: 'Monitors service level agreement performance against committed targets.',
    category: 'Compliance',
    defaultTemplate: {
      sections: [
        { id: 'sla-overview', title: 'SLA Overview', type: 'kpi', order: 1 },
        { id: 'sla-table', title: 'SLA Metrics', type: 'table', order: 2 },
        { id: 'sla-trend', title: 'SLA Trend', type: 'chart', order: 3 },
        { id: 'breaches', title: 'SLA Breaches', type: 'table', order: 4 },
      ],
    },
    chartTypes: ['gauge', 'line', 'bar', 'bullet'],
    requiredFields: ['slaName', 'target', 'actual', 'period'],
    optionalFields: ['service', 'breachCount', 'penalty', 'notes'],
  },

  // ── Marketing ──
  {
    id: 'market-trend',
    name: 'Market Trend Report',
    description: 'Analyses market trends, industry shifts, and emerging opportunities.',
    category: 'Marketing',
    defaultTemplate: {
      sections: [
        { id: 'trend-overview', title: 'Trend Overview', type: 'text', order: 1 },
        { id: 'trend-chart', title: 'Market Trends', type: 'chart', order: 2 },
        { id: 'data-table', title: 'Trend Data', type: 'table', order: 3 },
        { id: 'implications', title: 'Strategic Implications', type: 'text', order: 4 },
      ],
    },
    chartTypes: ['line', 'area', 'bar', 'scatter'],
    requiredFields: ['metric', 'value', 'period', 'segment'],
    optionalFields: ['source', 'confidence', 'benchmark', 'notes'],
  },
  {
    id: 'market-competitor',
    name: 'Competitor Analysis Report',
    description: 'Compares competitive positioning, market share, and strategic moves.',
    category: 'Marketing',
    defaultTemplate: {
      sections: [
        { id: 'landscape', title: 'Competitive Landscape', type: 'text', order: 1 },
        { id: 'share-chart', title: 'Market Share', type: 'chart', order: 2 },
        { id: 'comparison-table', title: 'Feature Comparison', type: 'table', order: 3 },
        { id: 'swot', title: 'SWOT Analysis', type: 'table', order: 4 },
        { id: 'recommendations', title: 'Recommendations', type: 'text', order: 5 },
      ],
    },
    chartTypes: ['pie', 'bar', 'radar', 'scatter'],
    requiredFields: ['competitor', 'marketShare', 'segment'],
    optionalFields: ['revenue', 'strengths', 'weaknesses', 'recentMoves', 'pricing'],
  },
  {
    id: 'market-customer-satisfaction',
    name: 'Customer Satisfaction Report',
    description: 'Tracks customer satisfaction scores, NPS, and feedback trends.',
    category: 'Marketing',
    defaultTemplate: {
      sections: [
        { id: 'csat-kpi', title: 'Satisfaction KPIs', type: 'kpi', order: 1 },
        { id: 'nps-chart', title: 'NPS Trend', type: 'chart', order: 2 },
        { id: 'feedback-table', title: 'Feedback Summary', type: 'table', order: 3 },
        { id: 'sentiment-chart', title: 'Sentiment Analysis', type: 'chart', order: 4 },
        { id: 'action-items', title: 'Action Items', type: 'text', order: 5 },
      ],
    },
    chartTypes: ['gauge', 'line', 'bar', 'pie', 'wordcloud'],
    requiredFields: ['score', 'responseDate', 'channel'],
    optionalFields: ['customerId', 'comments', 'category', 'product', 'region'],
  },

  // ── IT ──
  {
    id: 'it-infrastructure',
    name: 'IT Infrastructure Report',
    description: 'Monitors infrastructure health, uptime, capacity, and performance metrics.',
    category: 'IT',
    defaultTemplate: {
      sections: [
        { id: 'infra-kpi', title: 'Infrastructure KPIs', type: 'kpi', order: 1 },
        { id: 'uptime-chart', title: 'Uptime & Availability', type: 'chart', order: 2 },
        { id: 'capacity-table', title: 'Capacity Utilisation', type: 'table', order: 3 },
        { id: 'performance-chart', title: 'Performance Metrics', type: 'chart', order: 4 },
        { id: 'alerts', title: 'Recent Alerts', type: 'table', order: 5 },
      ],
    },
    chartTypes: ['gauge', 'line', 'bar', 'heatmap', 'area'],
    requiredFields: ['system', 'uptime', 'cpuUsage', 'memoryUsage', 'period'],
    optionalFields: ['diskUsage', 'networkThroughput', 'errorRate', 'responseTime', 'region'],
  },
  {
    id: 'it-incident',
    name: 'IT Incident Report',
    description: 'Tracks IT incidents, resolution times, and root cause analysis.',
    category: 'IT',
    defaultTemplate: {
      sections: [
        { id: 'incident-kpi', title: 'Incident KPIs', type: 'kpi', order: 1 },
        { id: 'incident-table', title: 'Incident Log', type: 'table', order: 2 },
        { id: 'severity-chart', title: 'Incidents by Severity', type: 'chart', order: 3 },
        { id: 'mttr-chart', title: 'MTTR Trend', type: 'chart', order: 4 },
        { id: 'root-cause', title: 'Root Cause Analysis', type: 'table', order: 5 },
      ],
    },
    chartTypes: ['bar', 'line', 'pie', 'gauge'],
    requiredFields: ['incidentId', 'severity', 'status', 'reportedDate'],
    optionalFields: ['resolvedDate', 'assignee', 'rootCause', 'impactedSystems', 'resolution'],
  },

  // ── Executive ──
  {
    id: 'executive-dashboard',
    name: 'Executive Dashboard',
    description: 'Consolidated view of key business metrics for executive leadership review.',
    category: 'Executive',
    defaultTemplate: {
      sections: [
        { id: 'exec-kpi', title: 'Key Performance Indicators', type: 'kpi', order: 1 },
        { id: 'revenue-chart', title: 'Revenue & Growth', type: 'chart', order: 2 },
        { id: 'dept-performance', title: 'Departmental Performance', type: 'table', order: 3 },
        { id: 'strategic-initiatives', title: 'Strategic Initiatives', type: 'table', order: 4 },
        { id: 'exec-summary', title: 'Executive Summary', type: 'text', order: 5 },
      ],
    },
    chartTypes: ['gauge', 'line', 'bar', 'pie', 'sparkline', 'kpi-card'],
    requiredFields: ['metric', 'value', 'target', 'period'],
    optionalFields: ['department', 'trend', 'status', 'owner', 'commentary'],
  },
  {
    id: 'executive-kpi',
    name: 'Executive KPI Report',
    description: 'Detailed KPI tracking with targets, actuals, and trend indicators for leadership.',
    category: 'Executive',
    defaultTemplate: {
      sections: [
        { id: 'kpi-scorecard', title: 'KPI Scorecard', type: 'kpi', order: 1 },
        { id: 'kpi-trends', title: 'KPI Trends', type: 'chart', order: 2 },
        { id: 'kpi-detail', title: 'KPI Details', type: 'table', order: 3 },
        { id: 'variance-analysis', title: 'Variance Analysis', type: 'chart', order: 4 },
        { id: 'commentary', title: 'Management Commentary', type: 'text', order: 5 },
      ],
    },
    chartTypes: ['gauge', 'bullet', 'sparkline', 'bar', 'line', 'kpi-card'],
    requiredFields: ['kpiName', 'actual', 'target', 'period'],
    optionalFields: ['unit', 'owner', 'frequency', 'threshold', 'trend', 'commentary'],
  },
];

export class ReportTypeRegistry {
  private types: Map<string, ReportTypeDefinition>;

  constructor() {
    this.types = new Map();
    for (const reportType of REPORT_TYPES) {
      this.types.set(reportType.id, reportType);
    }
    logger.info(`ReportTypeRegistry initialized with ${this.types.size} report types`);
  }

  /**
   * Returns all registered report types.
   */
  getAllTypes(): ReportTypeDefinition[] {
    logger.debug('Retrieving all report types');
    return Array.from(this.types.values());
  }

  /**
   * Returns a specific report type by its ID.
   */
  getTypeById(typeId: string): ReportTypeDefinition | undefined {
    const reportType = this.types.get(typeId);
    if (!reportType) {
      logger.warn(`Report type not found: ${typeId}`);
    }
    return reportType;
  }

  /**
   * Returns all report types belonging to a given category.
   */
  getTypesByCategory(category: ReportCategory): ReportTypeDefinition[] {
    logger.debug(`Filtering report types by category: ${category}`);
    return Array.from(this.types.values()).filter((t) => t.category === category);
  }

  /**
   * Returns the default template sections for a given report type.
   */
  getDefaultSections(typeId: string): SectionTemplate[] | undefined {
    const reportType = this.types.get(typeId);
    if (!reportType) {
      logger.warn(`Cannot get default sections: report type not found: ${typeId}`);
      return undefined;
    }
    return reportType.defaultTemplate.sections;
  }

  /**
   * Returns the recommended chart types for a given report type.
   */
  getRecommendedCharts(typeId: string): string[] | undefined {
    const reportType = this.types.get(typeId);
    if (!reportType) {
      logger.warn(`Cannot get recommended charts: report type not found: ${typeId}`);
      return undefined;
    }
    return reportType.chartTypes;
  }
}

export const reportTypeRegistry = new ReportTypeRegistry();
