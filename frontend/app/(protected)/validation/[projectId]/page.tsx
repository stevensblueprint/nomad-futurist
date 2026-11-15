import ValidationForm from "./ValidationForm";

type ValidationPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ValidationPage({ params }: ValidationPageProps) {
  const { projectId } = await params;

  return <ValidationForm projectId={projectId} />;
}
