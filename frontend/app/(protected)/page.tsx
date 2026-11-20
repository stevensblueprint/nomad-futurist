"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { usePortalUser } from "../components/portal/PortalShell";
import { feed, feedCategories, sampleProject, type FeedCategory } from "./portal-content";
import StartupNews from "./StartupNews";
import styles from "./Portal.module.css";

const categoryLabels = { News: "News", Jobs: "Job", Events: "Event" };
const actions = {
  News: "Read the briefing",
  Jobs: "Explore the example role",
  Events: "View the sample event",
};

function SampleUpdate({ item }: { item: (typeof feed)[number] }) {
  return (
    <article className={styles.card}>
      <p className={styles.eyebrow}>{categoryLabels[item.category]} · Sample{item.project && ` · ${item.project}`}</p>
      <h3 className={styles.cardTitle}>{item.title}</h3>
      <p>{item.summary}</p>
      {item.schedule && <p className={styles.small}>{item.schedule}</p>}
      <p className={styles.small}>{item.meta}</p>
      <details className={styles.details}>
        <summary>{actions[item.category]} <span aria-hidden="true">→</span></summary>
        <p>{item.detail}</p>
      </details>
    </article>
  );
}

export default function UserPortal() {
  const user = usePortalUser();
  const canRegister = user?.groups.includes("Founders") ?? false;
  const [category, setCategory] = useState<FeedCategory>("All updates");
  const [project, setProject] = useState("");
  const showNews = category === "News" || category === "All updates";
  const newsTopic = project ? "edge-computing" : "startups";
  const updates = feed.filter((item) => {
    if (project ? item.project !== project : item.project) return false;
    return category === "All updates" ? Boolean(project || item.featured) : item.category === category;
  });

  return (
    <main className={styles.page}>
      <div className={styles.greeting}>
        <div>
          <h1>Welcome back{user ? `, ${user.name.split(/\s+/)[0]}` : ""}.</h1>
          <p className={styles.desktopGreeting}>A place to connect, discover and move your ideas forward.</p>
          <p className={styles.mobileGreeting}>Your network. Your next move.</p>
        </div>
        {canRegister && <Link href="/registration" className={`${styles.control} ${styles.desktopRegister}`}>Register another project +</Link>}
      </div>

      <section className={styles.hero} aria-labelledby="community-heading">
        <div className={styles.heroMessage}>
          <p className={styles.eyebrow}>Ideas need a community</p>
          <h2 id="community-heading">Big ideas. Shared futures.</h2>
          <p className={styles.heroDescription}>Discover the knowledge, opportunities and people shaping digital infrastructure.</p>
          <p className={styles.heroTagline}>Knowledge. Opportunity. Connection.</p>
        </div>
        <div className={styles.signature}>
          <Image src="/assets/portal/logo-copper.png" alt="" width={108} height={81} unoptimized />
          <div>
            <p className={styles.cardTitle}>Built on connection.</p>
            <p className={styles.small}>From your first question to your next breakthrough.</p>
          </div>
        </div>
      </section>

      <section className={styles.network} aria-labelledby="network-heading">
        <div className={styles.networkHeading}>
          <h2 id="network-heading">Around the network</h2>
        </div>
        <p>
          {project
            ? "Updates about edge computing, the focus of the sample EdgeLoop project."
            : category === "News"
              ? "Recent startup stories from the Hacker News community."
              : "Fresh perspectives, open doors and conversations worth joining."}
        </p>
        <div className={styles.filters}>
          <div className={styles.categories} role="group" aria-label="Update category">
            {feedCategories.map((item) => (
              <button className={styles.control} key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>
                {item}
              </button>
            ))}
          </div>
          <div className={styles.projectFilter}>
            <label htmlFor="portal-project">Project</label>
            <select id="portal-project" className={`${styles.control} ${project ? styles.selected : ""}`} value={project} onChange={(event) => setProject(event.target.value)}>
              <option value="">All projects</option>
              <option value={sampleProject.name}>{sampleProject.name}</option>
            </select>
            {project && <button type="button" className={styles.control} aria-label="Clear project filter" onClick={() => setProject("")}>×</button>}
          </div>
        </div>

        <div className={styles.columns}>
          <div className={styles.stack}>
            {showNews && (
              <StartupNews
                key={newsTopic}
                topic={newsTopic}
                limit={category === "All updates" ? 1 : 6}
                fallback={updates.filter((item) => item.category === "News").map((item) => (
                  <SampleUpdate key={item.title} item={item} />
                ))}
              />
            )}
            {!showNews && updates.length === 0 && <p className={styles.card} role="status">No updates match these filters.</p>}
            {updates.filter((item) => item.category !== "News").map((item) => (
              <SampleUpdate key={item.title} item={item} />
            ))}
          </div>
          <aside className={styles.stack} aria-label="Workspace and industry context">
            <article className={styles.card}>
              <p className={styles.eyebrow}>Your project · Sample</p>
              <h3 className={styles.cardTitle}>{sampleProject.name}</h3>
              <p>{sampleProject.summary}</p>
              <p className={styles.small}>Owner: {sampleProject.owner}<br />Started: {sampleProject.started} · Target: {sampleProject.target}</p>
              <label className={styles.linkText} htmlFor="edgeloop-progress">Project progress · {sampleProject.progress}% (sample)</label>
              <progress id="edgeloop-progress" className={styles.progress} max={100} value={sampleProject.progress} />
              <Link className={`${styles.control} ${styles.selected}`} href={`/projects#${sampleProject.slug}`}>Open project overview <span aria-hidden="true">→</span></Link>
              {canRegister && <Link className={`${styles.control} ${styles.mobileRegister}`} href="/registration">Register another project +</Link>}
              <div className={styles.projectShortcuts}>
                <Link className={styles.source} href="/projects#sample-project-tasks">Tasks</Link>
                <details className={styles.details}>
                  <summary>More actions</summary>
                  <a className={styles.source} href="#network-heading" onClick={(event) => {
                    setProject(sampleProject.name);
                    event.currentTarget.closest("details")?.removeAttribute("open");
                  }}>See relevant updates</a>
                </details>
              </div>
            </article>
            <article className={`${styles.card} ${styles.upcoming}`}>
              <p className={styles.eyebrow}>On the horizon</p>
              <h3 className={styles.cardTitle}>Designing a more sustainable data center</h3>
              <p>Sample roundtable with operators, technologists and founders.</p>
              <p className={styles.small}>Illustrative · 24 Nov 2026<br />11:00 AM–12:00 PM EST (UTC−5)</p>
              <details className={styles.details}>
                <summary>View sample event <span aria-hidden="true">→</span></summary>
                <p>Example agenda: compare cooling approaches, discuss how to measure efficiency, and share lessons from retrofits.</p>
              </details>
            </article>
            <div className={styles.notice}>
              <p className={styles.linkText}>A preview of what’s possible</p>
              <p className={styles.small}>Jobs, events and project details are illustrative sample content.</p>
            </div>
          </aside>
        </div>
      </section>

      <article className={`${styles.card} ${styles.statistic}`}>
        <p className={styles.eyebrow}>Industry statistics</p>
        <h2>Data center electricity use</h2>
        <p>Data centers used an estimated <strong>415 TWh</strong> worldwide in 2024. The IEA projects about <strong>945 TWh</strong> in 2030 in its base case.</p>
        <a className={styles.source} href="https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai">Source: International Energy Agency, Energy and AI (2025)</a>
      </article>
      <footer className={styles.small}>Nomad Futurist Incubator / Connect. Learn. Build.</footer>
    </main>
  );
}
