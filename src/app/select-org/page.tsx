import { OrganizationList } from "@clerk/nextjs";

export default function SelectOrgPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <OrganizationList
        afterSelectOrganizationUrl="/"
        afterCreateOrganizationUrl="/"
        hidePersonal
      />
    </div>
  );
}
