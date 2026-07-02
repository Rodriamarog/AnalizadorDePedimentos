import { redirect } from "next/navigation";

// No standalone Dashboard module (removed from nav per user request) — "/"
// just lands on Pedimentos, the actual home screen of the app.
export default function RootPage() {
  redirect("/pedimentos");
}
