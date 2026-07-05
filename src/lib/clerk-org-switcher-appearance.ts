// The default "Administrar Organización" action button in the org switcher
// popover renders oversized relative to the org preview rows above it —
// shrink it down to a compact pill in line with the rest of the menu.
export const clerkOrgSwitcherAppearance = {
  elements: {
    organizationSwitcherPopoverActionButton__manageOrganization: {
      fontSize: "0.75rem",
      padding: "0.375rem 0.625rem",
      minHeight: "auto",
    },
    organizationSwitcherPopoverActionButtonIconBox__manageOrganization: {
      width: "1rem",
      height: "1rem",
    },
    organizationSwitcherPopoverActionButtonIcon__manageOrganization: {
      width: "0.875rem",
      height: "0.875rem",
    },
  },
};
