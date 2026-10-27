import { AppHeader } from "@/components/AppHeader";
import { liveStreak } from "@/lib/progress";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader streak={liveStreak(user)} name={user.name} />
      {children}
    </div>
  );
}
