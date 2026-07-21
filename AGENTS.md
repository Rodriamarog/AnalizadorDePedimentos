<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Deploying this app

If asked to deploy this app anywhere ("the mini pc", "prod", "my server", or just "deploy"),
**read `DEPLOYMENT_GUIDE.md` in full before doing anything.** There is a working deploy script
(`scripts/deploy-windows-mini-pc.sh`) — use it. Do not hand-roll tar/scp/ssh steps from general
knowledge of the mini-pc's architecture; the script encodes app-specific logic (prod secrets
overlay, DB host rewriting) that a manual deploy will silently skip.
