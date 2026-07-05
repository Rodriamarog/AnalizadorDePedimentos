## Wrapping and setup

Most components need no wrapper — just import and render. Three exceptions
throw at render time without their context provider:

- **`Tooltip`** needs a `TooltipProvider` ancestor (usually once near the
  root): `<TooltipProvider><Tooltip>…</Tooltip></TooltipProvider>`.
- **`Sidebar`, `SidebarTrigger`, `SidebarRail`, `SidebarMenuButton`** (and
  other `Sidebar*` subparts) need a `SidebarProvider` ancestor —
  `useSidebar()` throws `"useSidebar must be used within a
  SidebarProvider"` otherwise.
- **`PageHeader`, `TopBarTitle`** need a `PageTitleProvider` ancestor —
  `PageHeader` calls `usePageTitle()` internally, which throws without it.
  `PageHeader` also renders nothing at all unless it's given `children`
  (action buttons) — its title/description are read by `TopBarTitle`
  elsewhere, not rendered inline.

Overlay components (`Dialog`, `Sheet`, `Popover`, `DropdownMenu`,
`TooltipContent`) portal their popup content to `document.body` — they are
controlled via `open`/`defaultOpen` + `onOpenChange`, same as the rest.

## Styling idiom

Tailwind utility classes via `className`, composed with a `cn()` merge
helper internally — every component accepts a plain `className` prop that
overrides/extends its defaults, no special prop-based theming API. Colors
and radii are CSS custom properties (oklch), consumed through their mapped
Tailwind utilities:

| Token (`--*` in `styles.css`) | Tailwind utility |
|---|---|
| `--primary` / `--primary-foreground` | `bg-primary`, `text-primary-foreground` |
| `--background` / `--foreground` | `bg-background`, `text-foreground` |
| `--muted` / `--muted-foreground` | `bg-muted`, `text-muted-foreground` |
| `--card` / `--card-foreground` | `bg-card`, `text-card-foreground` |
| `--border` / `--input` / `--ring` | `border-border`, `border-input`, `ring-ring` |
| `--destructive` | `bg-destructive`, `text-destructive` |
| `--sidebar` / `--sidebar-foreground` / `--sidebar-accent` | `bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-accent` |
| `--radius` (+ `--radius-sm/md/lg/xl`) | `rounded-lg`, `rounded-xl`, etc. |

The sidebar is always dark navy regardless of light/dark mode — it has its
own token set (`--sidebar*`), separate from the page's `--background`.
`--primary` is a burnt-orange accent shared between primary buttons and the
active sidebar item.

## Where the truth lives

`styles.css` (root) `@import`s the real compiled stylesheet
(`_ds_bundle.css`) — read that for the full token list and generated
utility classes. Each component's `<Name>.d.ts` is its prop contract;
`<Name>.prompt.md` has usage notes and, where authored, real composition
examples.

## Example: a composed card

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter, Badge, Button } from "pedimentos-v2-ds";

<Card>
  <CardHeader>
    <CardTitle>Pedimento 24384521901</CardTitle>
    <CardDescription>Comercial del Norte SA</CardDescription>
    <CardAction><Badge variant="secondary">14 partidas</Badge></CardAction>
  </CardHeader>
  <CardContent>…</CardContent>
  <CardFooter><Button size="sm">Ver detalle</Button></CardFooter>
</Card>
```
