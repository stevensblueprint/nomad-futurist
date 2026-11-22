import type { StartupStory } from "../../startup-news";

const CACHE_SECONDS = 900;
const MAX_STORIES = 6;
const DAY_SECONDS = 86_400;
const startupTitle = /\b(?:start[ -]?ups?|venture capital|seed funding|pre[ -]seed|series [a-d])\b/i;
const edgeTitle = /\b(?:edge computing|edge infrastructure|edge ai|edge inference|edge devices|edge cloud)\b/i;

export async function GET(request: Request) {
  const topic = new URL(request.url).searchParams.get("topic");
  if (topic !== null && topic !== "startups" && topic !== "edge-computing") {
    return Response.json({ error: "Unknown news topic." }, { status: 400 });
  }

  const edgeTopic = topic === "edge-computing";
  const titlePattern = edgeTopic ? edgeTitle : startupTitle;
  const oldestDay = Math.floor(Date.now() / (DAY_SECONDS * 1000)) - 90;
  const url = new URL("https://hn.algolia.com/api/v1/search_by_date");
  url.search = new URLSearchParams({
    query: edgeTopic ? "edge computing" : "startup",
    tags: "story",
    restrictSearchableAttributes: "title",
    numericFilters: `points>=8,created_at_i>=${oldestDay * DAY_SECONDS}`,
    hitsPerPage: "40",
  }).toString();

  try {
    const response = await fetch(url, {
      next: { revalidate: CACHE_SECONDS },
      signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) throw new Error("News provider request failed");

    const payload: { hits?: unknown } = await response.json();
    if (!Array.isArray(payload?.hits)) throw new Error("Invalid news provider response");

    const stories: StartupStory[] = [];
    const seen = new Set<string>();
    for (const hit of payload.hits) {
      const story = parseStory(hit);
      if (!story || !titlePattern.test(story.title) || seen.has(story.url)) continue;
      seen.add(story.url);
      stories.push(story);
      if (stories.length === MAX_STORIES) break;
    }

    return Response.json({ stories }, {
      headers: { "Cache-Control": `public, max-age=60, s-maxage=${CACHE_SECONDS}` },
    });
  } catch {
    return Response.json({ error: "Startup news is temporarily unavailable." }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

function parseStory(value: unknown): StartupStory | null {
  if (!value || typeof value !== "object") return null;
  const hit = value as Record<string, unknown>;
  if (
    typeof hit.objectID !== "string" || !/^\d+$/.test(hit.objectID) ||
    typeof hit.title !== "string" || !hit.title.trim() ||
    typeof hit.created_at !== "string" || !Number.isFinite(Date.parse(hit.created_at)) ||
    typeof hit.url !== "string"
  ) return null;

  let link: URL;
  try {
    link = new URL(hit.url);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(link.protocol) || link.username || link.password) return null;
  link.hash = "";

  return {
    id: hit.objectID,
    title: hit.title.trim(),
    url: link.href,
    publisher: link.hostname.replace(/^www\./, ""),
    postedAt: new Date(hit.created_at).toISOString(),
  };
}
