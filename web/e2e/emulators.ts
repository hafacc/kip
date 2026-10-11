/**
 * Typed helpers for the Firebase emulators' REST APIs: seeding and reading
 * Firestore past the rules, and reading what the Auth emulator would have sent.
 */

/** Origin of the emulated dev server. */
export const APP_ORIGIN = process.env.KIP_ORIGIN ?? "http://localhost:3001";
/** Firestore emulator origin. */
export const FIRESTORE_ORIGIN = "http://127.0.0.1:8080";
/** Auth emulator origin. */
export const AUTH_ORIGIN = "http://127.0.0.1:9099";
// Firestore namespaces under the project the CLIENT is configured with, since
// pointing the SDK at an emulator does not change it. Auth namespaces under the
// id the emulator was STARTED with: the client authenticates with a fake API
// key, so there is no project in the request for it to honor.
/** Project the web client's data lives under in the Firestore emulator. */
export const CLIENT_PROJECT = "hafaio-kip-dev";
/** Project `emulators:exec` was started with. */
export const EMULATOR_PROJECT = "demo-kip";

/** A Firestore REST value. */
export type Value =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { nullValue: null }
  | { arrayValue: { values?: Value[] } }
  | { mapValue: { fields?: Fields } };

/** A Firestore REST document's fields. */
export type Fields = Record<string, Value>;

/** A Firestore REST document. */
export interface FirestoreDocument {
  name: string;
  fields?: Fields;
}

/** string value */
export const str = (stringValue: string): Value => ({ stringValue });
/** timestamp value */
export const ts = (timestampValue: string): Value => ({ timestampValue });
/** integer value */
export const int = (value: number): Value => ({ integerValue: String(value) });
/** double value */
export const double = (doubleValue: number): Value => ({ doubleValue });
/** boolean value */
export const bool = (booleanValue: boolean): Value => ({ booleanValue });
/** null value */
export const nul = (): Value => ({ nullValue: null });
/** array value */
export const arr = (values: Value[]): Value => ({ arrayValue: { values } });
/** map value */
export const map = (fields: Fields): Value => ({ mapValue: { fields } });

/** A plain JSON value read back off a document. */
export type Plain =
  | string
  | number
  | boolean
  | null
  | Plain[]
  | { [key: string]: Plain };

/** convert a REST value to plain JSON */
export function plain(value: Value): Plain {
  if ("stringValue" in value) {
    return value.stringValue;
  } else if ("booleanValue" in value) {
    return value.booleanValue;
  } else if ("timestampValue" in value) {
    return value.timestampValue;
  } else if ("nullValue" in value) {
    return null;
  } else if ("integerValue" in value) {
    return Number(value.integerValue);
  } else if ("doubleValue" in value) {
    return value.doubleValue;
  } else if ("arrayValue" in value) {
    return (value.arrayValue.values ?? []).map(plain);
  } else {
    return plainFields(value.mapValue.fields ?? {});
  }
}

/** convert a document's fields to plain JSON */
export function plainFields(fields: Fields): { [key: string]: Plain } {
  return Object.fromEntries(
    Object.entries(fields).map(([key, held]) => [key, plain(held)]),
  );
}

/** the string held in a field, if it is one */
export function text(value: Value | undefined): string | undefined {
  return value && "stringValue" in value ? value.stringValue : undefined;
}

// The emulator accepts `Bearer owner` as an admin and skips the rules, which is
// what lets a fixture build a host without pretending to be one.
const ADMIN = { Authorization: "Bearer owner" };

// A failed call that read as an empty answer is how "no accounts" and "no
// documents" pass without the emulator having said so.
/** the response, or a throw naming what was asked when it is not OK */
async function answered(what: string, response: Response): Promise<Response> {
  if (response.ok) {
    return response;
  } else {
    throw new Error(`${what}: ${response.status} ${await response.text()}`);
  }
}

/** The Firestore emulator's documents under one project, read and written as an admin. */
export class EmulatedFirestore {
  readonly root: string;

  constructor(project: string = CLIENT_PROJECT) {
    this.root = `${FIRESTORE_ORIGIN}/v1/projects/${project}/databases/(default)/documents`;
  }

  /** write a document's fields, replacing what was there */
  async put(path: string, fields: Fields): Promise<void> {
    const response = await fetch(`${this.root}/${path}`, {
      method: "PATCH",
      headers: { ...ADMIN, "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    if (!response.ok) {
      throw new Error(
        `seed ${path}: ${response.status} ${await response.text()}`,
      );
    }
  }

  /** read a document's fields, or null when it is not there */
  async read(path: string): Promise<Fields | null> {
    const response = await fetch(`${this.root}/${path}`, { headers: ADMIN });
    if (response.status === 404) {
      return null;
    } else if (!response.ok) {
      throw new Error(`read ${path}: ${response.status}`);
    } else {
      const document = (await response.json()) as FirestoreDocument;
      return document.fields ?? {};
    }
  }

  /** whether a document exists */
  async exists(path: string): Promise<boolean> {
    return (await this.read(path)) !== null;
  }

  /** delete a document */
  async remove(path: string): Promise<void> {
    await answered(
      `remove ${path}`,
      await fetch(`${this.root}/${path}`, { method: "DELETE", headers: ADMIN }),
    );
  }

  /** list a collection's documents */
  async list(path: string): Promise<FirestoreDocument[]> {
    const response = await answered(
      `list ${path}`,
      await fetch(`${this.root}/${path}?pageSize=300`, { headers: ADMIN }),
    );
    const page = (await response.json()) as {
      documents?: FirestoreDocument[];
    };
    return page.documents ?? [];
  }

  /** the documents in a collection whose string field equals a value */
  async where(
    collectionId: string,
    field: string,
    value: string,
  ): Promise<FirestoreDocument[]> {
    const asked = await fetch(`${this.root}:runQuery`, {
      method: "POST",
      headers: { ...ADMIN, "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          where: {
            fieldFilter: {
              field: { fieldPath: field },
              op: "EQUAL",
              value: { stringValue: value },
            },
          },
        },
      }),
    });
    const response = await answered(`query ${collectionId}`, asked);
    const rows = (await response.json()) as { document?: FirestoreDocument }[];
    return rows.flatMap((row) => (row.document ? [row.document] : []));
  }
}

const IDENTITY = `${AUTH_ORIGIN}/identitytoolkit.googleapis.com/v1`;

interface Account {
  localId: string;
  email?: string;
}

/** every account the Auth emulator holds */
export async function accounts(
  project: string = EMULATOR_PROJECT,
): Promise<Account[]> {
  const response = await answered(
    `accounts in ${project}`,
    await fetch(`${IDENTITY}/projects/${project}/accounts:query`, {
      method: "POST",
      headers: { ...ADMIN, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
  );
  const { userInfo = [] } = (await response.json()) as {
    userInfo?: Account[];
  };
  return userInfo;
}

// Asked of the emulator, never scraped from the browser: the SDK moves a session
// between localStorage and IndexedDB as it sees fit, so a uid read off storage
// can be wrong by the next page load.
/** the uid of the account holding an address, if there is one */
export async function uidOf(email: string): Promise<string | undefined> {
  return (await accounts()).find((account) => account.email === email)?.localId;
}

/** whether the Auth emulator still holds an account */
export async function accountExists(
  uid: string,
  project: string = EMULATOR_PROJECT,
): Promise<boolean> {
  return (await accounts(project)).some((account) => account.localId === uid);
}

/** the one-time code in the last sign-in link the emulator would have mailed */
export async function emailCode(email: string): Promise<string | undefined> {
  const response = await answered(
    "sign-in links",
    await fetch(
      `${AUTH_ORIGIN}/emulator/v1/projects/${EMULATOR_PROJECT}/oobCodes`,
    ),
  );
  const { oobCodes = [] } = (await response.json()) as {
    oobCodes?: { email: string; oobLink: string }[];
  };
  const link = oobCodes.findLast((sent) => sent.email === email)?.oobLink;
  return link
    ? (new URL(link).searchParams.get("oobCode") ?? undefined)
    : undefined;
}

/** the last code the emulator would have texted a number */
export async function textedCode(number: string): Promise<string | undefined> {
  const response = await answered(
    "texted codes",
    await fetch(
      `${AUTH_ORIGIN}/emulator/v1/projects/${EMULATOR_PROJECT}/verificationCodes`,
    ),
  );
  const { verificationCodes = [] } = (await response.json()) as {
    verificationCodes?: { phoneNumber: string; code: string }[];
  };
  return verificationCodes.findLast((sent) => sent.phoneNumber === number)
    ?.code;
}

// The emulator's link points at its own action page, which would redirect; the
// app's `/continue/` is what has to handle the code, so it is handed there with
// the query Firebase's redirect would arrive with.
/** the app URL a mailed sign-in link lands on */
export function continueUrl(email: string, code: string): string {
  return `${APP_ORIGIN}/continue/?mode=signIn&lang=en&apiKey=fake-api-key&oobCode=${encodeURIComponent(code)}#email=${encodeURIComponent(email)}`;
}

/** set custom claims on an account */
export async function setClaims(
  uid: string,
  claims: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${IDENTITY}/projects/${EMULATOR_PROJECT}/accounts:update`, {
    method: "POST",
    headers: { ...ADMIN, "Content-Type": "application/json" },
    body: JSON.stringify({
      localId: uid,
      customAttributes: JSON.stringify(claims),
    }),
  });
}

/** create a password account and return its uid */
export async function signUp(email: string): Promise<string> {
  const response = await fetch(`${IDENTITY}/accounts:signUp?key=fake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "sekret1",
      returnSecureToken: true,
    }),
  });
  if (!response.ok) {
    throw new Error(`signUp: ${await response.text()}`);
  } else {
    return ((await response.json()) as { localId: string }).localId;
  }
}

/** mint an ID token for an existing email account through a fresh sign-in link */
export async function idToken(email: string): Promise<string> {
  await answered(
    `a sign-in link for ${email}`,
    await fetch(`${IDENTITY}/accounts:sendOobCode?key=fake-api-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestType: "EMAIL_SIGNIN",
        email,
        continueUrl: APP_ORIGIN,
      }),
    }),
  );
  const code = await emailCode(email);
  const minted = await answered(
    `a token for ${email}`,
    await fetch(`${IDENTITY}/accounts:signInWithEmailLink?key=fake-api-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, oobCode: code }),
    }),
  );
  return ((await minted.json()) as { idToken: string }).idToken;
}
