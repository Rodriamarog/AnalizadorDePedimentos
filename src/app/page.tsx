import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { LandingPage } from "@/components/landing/landing-page";

export default async function RootPage() {
  const { userId } = await auth();
  if (userId) redirect("/pedimentos");
  return <LandingPage />;
}
