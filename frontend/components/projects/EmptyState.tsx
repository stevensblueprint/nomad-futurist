import Link from "next/link";
import { card, primaryButton } from "./styles";

export function EmptyState() {
  return (
    <section
      aria-labelledby="projects-empty-heading"
      className={`${card} mx-auto flex max-w-xl flex-col items-center px-6 py-14 text-center`}
    >
      <div className="mb-5 h-1 w-12 rounded-full bg-nf-copper" aria-hidden="true" />
      <h2 id="projects-empty-heading" className="font-heading text-xl font-semibold text-nf-navy">
        No projects yet
      </h2>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-nf-muted">
        You haven&apos;t registered a project with the incubator. Tell us what you&apos;re building and
        the support you need, and it will appear here with its progress and next steps.
      </p>
      <Link href="/registration" className={`${primaryButton} mt-7`}>
        Register your first project <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
