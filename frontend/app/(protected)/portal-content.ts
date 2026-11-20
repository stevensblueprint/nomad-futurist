export const feedCategories = ["All updates", "News", "Jobs", "Events"] as const;
export type FeedCategory = (typeof feedCategories)[number];

export const sampleProject = {
  slug: "proj-edgeloop",
  name: "EdgeLoop",
  summary: "Local edge computing for community services.",
  owner: "Alex Kim",
  started: "4 Nov 2026",
  target: "28 Feb 2027",
  progress: 30,
} as const;

type FeedItem = {
  category: Exclude<FeedCategory, "All updates">;
  title: string;
  summary: string;
  meta: string;
  detail: string;
  schedule?: string;
  project?: typeof sampleProject.name;
  featured?: boolean;
};

export const feed: FeedItem[] = [
  {
    category: "News",
    title: "What liquid cooling changes for early-stage founders",
    summary: "A practical primer on building services for the next generation of data centers.",
    meta: "Industry briefing",
    detail: "Before building a monitoring or maintenance service, ask operators who owns the cooling loop, how leaks are detected, and which measurements they already collect.",
    featured: true,
  },
  {
    category: "Jobs",
    title: "Data Center Sustainability Analyst",
    summary: "An illustrative role helping a digital-infrastructure venture improve its environmental performance.",
    meta: "Sample role · Hybrid · Early career",
    detail: "Example responsibilities include tracking electricity and water use, documenting data quality, and helping operators evaluate efficiency projects.",
    featured: true,
  },
  {
    category: "Events",
    title: "From technical insight to a venture worth building",
    summary: "An illustrative founder exchange on validating a problem before building the solution.",
    meta: "Online · Sample founder exchange",
    schedule: "Illustrative · 18 Nov 2026\n2:00–2:45 PM EST (UTC−5)",
    detail: "Example agenda: compare customer interviews, narrow the problem statement, and turn one assumption into a test.",
    featured: true,
  },
  {
    category: "News",
    title: "A founder’s guide to resilient digital infrastructure",
    summary: "Explore the questions worth asking about uptime, reliability and the customer experience.",
    meta: "Entrepreneurship",
    detail: "Define what downtime means to customers, which dependencies are outside your control, and how you will communicate during an incident.",
  },
  {
    category: "News",
    title: "Turning waste heat into a useful resource",
    summary: "A sample explainer on the partnerships and business models around data center heat reuse.",
    meta: "Sustainability",
    detail: "Look for a nearby customer with consistent heat demand and check whether the available temperature meets their needs throughout the year.",
  },
  {
    category: "News",
    title: "Taking edge infrastructure closer to the customer",
    summary: "A sample briefing on where local compute creates value and how to test demand.",
    meta: "Edge computing",
    detail: "A pilot can test whether lower latency or offline operation matters enough to justify local equipment and maintenance.",
    project: "EdgeLoop",
  },
  {
    category: "Jobs",
    title: "Edge Systems Engineer",
    summary: "An illustrative role building reliable, small-footprint infrastructure for an early-stage venture.",
    meta: "Sample role · Remote · Engineering",
    detail: "Example responsibilities include planning remote deployments, monitoring connectivity, and designing an update process that can recover from failures.",
    project: "EdgeLoop",
  },
  {
    category: "Events",
    title: "Test your edge-computing value proposition",
    summary: "A sample founder workshop on customer discovery, deployment constraints and viable pilots.",
    meta: "Online · Sample founder workshop",
    schedule: "Illustrative · 25 Nov 2026\n2:00–2:45 PM EST (UTC−5)",
    detail: "Example agenda: identify a pilot customer, agree on a measurable outcome, and map on-site installation constraints.",
    project: "EdgeLoop",
  },
];
