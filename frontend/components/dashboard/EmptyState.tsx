import Link from "next/link";

export function EmptyState() {
  return (
    <div className="text-lg font-semibold text-[#022C3F]">
      <div>

      </div>
      <h3>
        No Registered Projects Found
      </h3>
      <p>
        You haven't registered a project proposal yet. Submit your application to get started.
      </p>
      <div>
        <link href="/registration" />
          Register New Project
      </div>
    </div>
  );
}
