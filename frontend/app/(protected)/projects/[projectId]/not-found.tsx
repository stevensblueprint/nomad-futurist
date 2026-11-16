import Link from "next/link";
import { card, primaryButton } from "@/components/projects/styles";

export default function ProjectNotFound() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 lg:px-10 lg:py-10">
      <section className={`${card} mx-auto max-w-xl px-6 py-14 text-center`}>
        <h1 className="font-heading text-xl font-semibold text-nf-navy">Project not found</h1>
        <p className="mt-3 text-sm leading-relaxed text-nf-muted">
          We couldn&apos;t find that project in your account. It may have been removed or the link is out of date.
        </p>
        <Link href="/projects" className={`${primaryButton} mt-7`}>
          Back to my projects
        </Link>
      </section>
    </main>
  );
}
