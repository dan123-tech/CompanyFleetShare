/**
 * Vercel "Ignored Build Step" script (vercel.json -> ignoreCommand).
 *
 * Exit 0  => ignore build (no deployment created)
 * Exit 1  => proceed with build
 *
 * Goal: skip Preview builds for Dependabot branches to avoid build queue spam and
 * avoid failing previews from major bumps (e.g. Prisma 7) while still letting
 * regular PR previews and production deploys build normally.
 */

function env(name) {
  return (process.env[name] || "").trim();
}

const ref = env("VERCEL_GIT_COMMIT_REF"); // branch name
const prId = env("VERCEL_GIT_PULL_REQUEST_ID"); // set for PR previews
const isPr = Boolean(prId);

// Dependabot branches are typically like:
// - dependabot/npm_and_yarn/<pkg>-<version>
// - dependabot/npm_and_yarn/all-npm-deps-<hash>
const isDependabotBranch = /^dependabot\//i.test(ref);

if (isPr && isDependabotBranch) {
  console.log(`[vercel-ignore-build] Ignoring Dependabot preview build for ref="${ref}" pr="${prId}"`);
  process.exit(0);
}

console.log(`[vercel-ignore-build] Building ref="${ref}" pr="${prId || "none"}"`);
process.exit(1);

