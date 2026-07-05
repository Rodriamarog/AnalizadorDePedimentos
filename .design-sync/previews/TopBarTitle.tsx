import { PageTitleProvider, TopBarTitle, usePageTitle } from "pedimentos-v2-ds";
import { FileText } from "lucide-react";

function Announcer() {
  usePageTitle("Pedimentos", "14 registrados", FileText);
  return null;
}

export function Default() {
  return (
    <PageTitleProvider>
      <div style={{ position: "relative", height: 48, width: 320, background: "#10121C" }}>
        <Announcer />
        <TopBarTitle />
      </div>
    </PageTitleProvider>
  );
}
