// Reads the feedback people have sent, via the Admin SDK and ADC:
//
//   cd web && bun run feedback [count]
//
// Lists reports with each sender resolved from Auth, which the in-app inbox
// deliberately doesn't show. A report carries a uid and nothing else; the name
// and address live on the Auth account, where kip keeps addresses everywhere
// else.

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "hafaio-kip-dev";
const LIMIT = Number(process.argv[2] ?? 50);

const app = initializeApp({
  credential: applicationDefault(),
  projectId: PROJECT_ID,
});
const db = getFirestore(app);
const auth = getAuth(app);

// One lookup per distinct reporter, not per report: someone who sends three
// costs one round trip. A deleted account resolves to nothing, which is the
// honest answer — their words outlive their account, by design.
const names = new Map<string, string>();
async function who(uid: string): Promise<string> {
  const known = names.get(uid);
  if (known !== undefined) return known;
  const user = await auth.getUser(uid).catch(() => null);
  const name = user
    ? `${user.displayName ?? "(no name)"} <${user.email ?? user.phoneNumber ?? "no address"}>`
    : "(account gone)";
  names.set(uid, name);
  return name;
}

const reports = await db
  .collection("feedback")
  .orderBy("at", "desc")
  .limit(LIMIT)
  .get();

if (reports.empty) {
  console.log("\nNothing yet.\n");
} else {
  console.log(
    `\n${reports.size} report${reports.size === 1 ? "" : "s"}, newest first\n`,
  );
  for (const report of reports.docs) {
    const { uid, text, at } = report.data();
    const when = at?.toDate?.()?.toISOString().slice(0, 16).replace("T", " ");
    console.log(`${"─".repeat(72)}`);
    console.log(`${when}  ${await who(uid)}`);
    console.log(`      ${report.id}`);
    console.log();
    for (const line of String(text).split("\n")) console.log(`  ${line}`);
    console.log();
  }
}
