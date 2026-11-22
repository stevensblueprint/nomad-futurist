"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { StartupStory } from "../startup-news";
import styles from "./Portal.module.css";

type NewsState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; stories: StartupStory[] };

const postedDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export default function StartupNews({
  topic,
  limit,
  fallback,
}: {
  topic: "startups" | "edge-computing";
  limit: number;
  fallback: ReactNode;
}) {
  const [state, setState] = useState<NewsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const request = new AbortController();
    const timeout = window.setTimeout(() => {
      request.abort();
      setState({ status: "unavailable" });
    }, 8000);

    async function load() {
      try {
        const response = await fetch(`/api/startup-news?topic=${topic}`, { signal: request.signal });
        if (!response.ok) throw new Error("Could not load startup news");
        const { stories } = await response.json() as { stories: StartupStory[] };
        if (!Array.isArray(stories)) throw new Error("Invalid startup news response");
        if (!request.signal.aborted) setState({ status: "ready", stories });
      } catch {
        if (!request.signal.aborted) setState({ status: "unavailable" });
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void load();
    return () => {
      window.clearTimeout(timeout);
      request.abort();
    };
  }, [topic, attempt]);

  if (state.status === "loading") {
    return <p className={styles.notice} role="status">Loading startup news…</p>;
  }

  if (state.status === "unavailable" || !state.stories.length) {
    return (
      <>
        <div className={styles.notice}>
          <p role="status">{state.status === "unavailable"
            ? "Startup news is temporarily unavailable. Showing sample briefings."
            : "No current stories match this topic. Showing sample briefings."}</p>
          {state.status === "unavailable" && (
            <button type="button" className={styles.control} onClick={() => {
              setState({ status: "loading" });
              setAttempt((previous) => previous + 1);
            }}>Retry news</button>
          )}
        </div>
        {fallback}
      </>
    );
  }

  return state.stories.slice(0, limit).map((story) => (
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
  ));
}
