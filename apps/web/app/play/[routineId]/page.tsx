import { GameplayClient } from "@/components/GameplayClient";

export default async function PlayPage({ params }: { params: Promise<{ routineId: string }> }) {
  const { routineId } = await params;
  return <GameplayClient routineId={routineId} />;
}
