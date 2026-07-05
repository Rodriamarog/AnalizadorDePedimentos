// Sits the auth form directly on the page's own background instead of
// floating as a separate white card on top of it — strips the card's own
// background/border/shadow and the footer band's divider so the panel reads
// as one surface.
export const clerkFlushAppearance = {
  elements: {
    cardBox: { boxShadow: "none", border: "none", backgroundColor: "transparent", overflow: "visible" },
    card: { boxShadow: "none", border: "none", backgroundColor: "transparent", overflow: "visible" },
    footer: { backgroundColor: "transparent", border: "none", boxShadow: "none" },
    footerAction: { backgroundColor: "transparent" },
    footerPages: { backgroundColor: "transparent" },
  },
};
