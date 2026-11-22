"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { StartupStory } from "../startup-news";
import styles from "./Portal.module.css";

type NewsState = {
  status: "loading" | "unavailable" | "ready";
  result: { stories: StartupStory[]; refreshedAt: number } | null;
};

const DAILY_REFRESH_MS = 24 * 60 * 60 * 1000;
// Match the server cache window when users switch between tabs.
const MINIMUM_REFRESH_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

const postedDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const refreshDate = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function StartupNews({
  topic,
  limit,
  fallback,
  visible = true,
}: {
  topic: "startups" | "edge-computing";
  limit: number;
  fallback: ReactNode;
  visible?: boolean;
}) {
  const [{ status, result }, setState] = useState<NewsState>({ status: "loading", result: null });
  const retry = useRef<(() => void) | null>(null);

  useEffect(() => {
    let lastAttempt = -Infinity;
    let nextRefresh: number;
    let activeRequest: { controller: AbortController; timeout: number } | null = null;

    async function refresh() {
      if (activeRequest) return;

      lastAttempt = Date.now();
      window.clearTimeout(nextRefresh);
      nextRefresh = window.setTimeout(refresh, DAILY_REFRESH_MS);
      setState((previous) => ({ ...previous, status: "loading" }));

      const controller = new AbortController();
      const timeout = window.setTimeout(() => {
        controller.abort();
        activeRequest = null;
        setState((previous) => ({ ...previous, status: "unavailable" }));
      }, REQUEST_TIMEOUT_MS);
      activeRequest = { controller, timeout };
      try {
        const response = await fetch(`/api/startup-news?topic=${topic}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Could not load startup news");
        const { stories } = await response.json() as { stories: StartupStory[] };
        if (!Array.isArray(stories)) throw new Error("Invalid startup news response");
        if (!controller.signal.aborted) {
          setState({ status: "ready", result: { stories, refreshedAt: Date.now() } });
        }
      } catch {
        if (!controller.signal.aborted) {
          setState((previous) => ({ ...previous, status: "unavailable" }));
        }
      } finally {
        window.clearTimeout(timeout);
        if (activeRequest?.controller === controller) activeRequest = null;
      }
    }

    function refreshOnReturn() {
      if (document.visibilityState === "visible" && Date.now() - lastAttempt >= MINIMUM_REFRESH_MS) {
        void refresh();
      }
    }

    retry.current = refresh;
    nextRefresh = window.setTimeout(refresh, 0);
    document.addEventListener("visibilitychange", refreshOnReturn);
    window.addEventListener("focus", refreshOnReturn);
    return () => {
      retry.current = null;
      window.clearTimeout(nextRefresh);
      if (activeRequest) {
        window.clearTimeout(activeRequest.timeout);
        activeRequest.controller.abort();
      }
      document.removeEventListener("visibilitychange", refreshOnReturn);
      window.removeEventListener("focus", refreshOnReturn);
    };
  }, [topic]);

  if (!visible) return null;

  const stories = result?.stories ?? [];
  const hasStories = stories.length > 0;

  return (
    <>
      {result && (
        <p className={styles.small}>
          Last refreshed at{" "}
          <time dateTime={new Date(result.refreshedAt).toISOString()}>
            {refreshDate.format(result.refreshedAt)}
          </time>
        </p>
      )}
      {status === "loading" && (
        <p className={styles.notice} role="status">{result ? "Refreshing startup news…" : "Loading startup news…"}</p>
      )}
      {status === "unavailable" && (
        <div className={styles.notice}>
          <p role="status">{hasStories
            ? "Startup news is temporarily unavailable. Showing stories from the last successful refresh."
            : "Startup news is temporarily unavailable. Showing sample briefings."}</p>
          <button type="button" className={styles.control} onClick={() => retry.current?.()}>Retry news</button>
        </div>
      )}
      {status === "ready" && !hasStories && (
        <p className={styles.notice} role="status">No current stories match this topic. Showing sample briefings.</p>
      )}
      {!hasStories && (result || status === "unavailable") && fallback}
      {stories.slice(0, limit).map((story) => (
        <article className={styles.card} key={story.id}>
          <p className={styles.eyebrow}>News · Hacker News</p>
          <h3 className={styles.cardTitle}>{story.title}</h3>
          <p className={styles.small}>
            {story.publisher} · Posted on Hacker News <time dateTime={story.postedAt}>{postedDate.format(new Date(story.postedAt))}</time>
          </p>
          <div className={styles.storyLinks}>
            <a className={styles.source} href={story.url}>Read the article <span aria-hidden="true">→</span></a>
            <a className={styles.source} href={`https://news.ycombinator.com/item?id=${story.id}`}>Hacker News discussion</a>
          </div>
        </article>
      ))}
    </>
  );
}
