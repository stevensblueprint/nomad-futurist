import Link from "next/link";
import { sampleProject } from "../portal-content";
import styles from "../Portal.module.css";

export default function ProjectsPage() {
  return (
    <main className={styles.page}>
      <h1>My projects</h1>
      <p>Your projects, progress and next steps.</p>
      <article className={styles.card} id={sampleProject.slug}>
        <p className={styles.eyebrow}>Sample project</p>
        <h2 className={styles.cardTitle}>{sampleProject.name}</h2>
        <p>{sampleProject.summary}</p>
        <p className={styles.small}>Owner: {sampleProject.owner} · Target: {sampleProject.target}</p>
        <p className={styles.linkText}>Project progress · {sampleProject.progress}% (sample)</p>
      </article>
      <section id="sample-project-tasks" className={styles.card} aria-labelledby="sample-project-tasks-heading">
        <p className={styles.eyebrow}>Sample project</p>
        <h2 id="sample-project-tasks-heading">EdgeLoop tasks</h2>
        <ul className={styles.taskList}>
          <li>Competitive analysis · In progress</li>
          <li>Customer interviews · Planned</li>
          <li>Pilot requirements · Planned</li>
        </ul>
      </section>
      <Link className={styles.source} href="/">Back to the portal</Link>
    </main>
  );
}
