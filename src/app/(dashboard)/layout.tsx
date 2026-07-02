import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { PageTitleProvider } from "@/components/page-title-context";
import { TopBarTitle } from "@/components/top-bar-title";
import { Bell } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <PageTitleProvider>
        <AppSidebar />
        <div className="flex-1 flex flex-col h-screen min-w-0">
          <header className="relative flex items-center h-13 border-b border-border bg-card/80 backdrop-blur-sm px-4 shrink-0 gap-3">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground -ml-1" />
            <Separator orientation="vertical" className="h-4" />
            <OrganizationSwitcher afterSelectOrganizationUrl="/" afterCreateOrganizationUrl="/" />
            <TopBarTitle />
            <div className="flex-1" />
            <button className="relative p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
            </button>
            <UserButton />
          </header>
          {/* min-h-0 is required for a flex child to be allowed to shrink below
              its content size — without it, "contained" grid pages (which rely
              on an inner flex-1 overflow-y-auto region) would just keep growing
              main instead of scrolling internally. Pages that want the old
              whole-page-scroll behavior (pedimento detail) opt back into it by
              giving their own root `overflow-y-auto`. */}
          <main className="flex-1 min-h-0 overflow-hidden p-6 md:p-8 flex flex-col">{children}</main>
        </div>
      </PageTitleProvider>
    </SidebarProvider>
  );
}
