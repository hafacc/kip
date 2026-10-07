<script lang="ts">
  import { BASE_PATH } from "#lib/base.ts";
  import H2 from "#lib/components/doc-h2.svelte";
  import List from "#lib/components/doc-list.svelte";
  import P from "#lib/components/doc-p.svelte";
  import DocPage, { link } from "#lib/components/doc-page.svelte";
  import { CONTACT_EMAIL, ISSUES_URL } from "#lib/contact.ts";
</script>

<DocPage
  title="Help"
  documentTitle="Help — kip"
  description="What kip is, how to stop its texts, and where to reach a person."
  route="/help/"
>
  <H2>Did kip text you?</H2>
  <P
    >kip is a small, friends-only app for lending spare rooms between friends —
    no money, no public listings. It's at
    <a class={link} href="https://kip.hafa.cc">kip.hafa.cc</a>.</P
  >
  <P
    >kip only ever texts people about their own account, and only if they turned
    texts on: someone asked to stay at a place you listed, a host answered your
    request, a confirmed stay was called off, or someone agreed to be friends.
    It never sends marketing.</P
  >
  <P
    ><strong>To stop the texts, reply STOP to the message.</strong>
    That works instantly, whoever you are — you don't need a kip account. (If
    you use kip, you can also turn texts off in Settings → Notifications.) If a
    text reached you and you've never used kip, the number may have previously
    belonged to someone who did; STOP ends it either way.</P
  >
  <H2>Something's broken, or you have a question</H2>
  <List>
    <li>
      <strong>The quickest route:</strong>
      tap your picture in kip, then <strong>Send feedback</strong>. It goes
      straight to us, needs no account anywhere else, and isn't posted publicly.
    </li>
    <li>
      <strong>Bugs and questions:</strong>
      <a class={link} href={ISSUES_URL}>open an issue on GitHub</a>
      — public, and the fastest way to get something fixed.
    </li>
    <li>
      <strong>Private matters</strong>
      — a privacy request, a safety concern, anything you'd rather not post
      publicly: email
      <a class={link} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. It
      goes straight to us, not onto the public issue tracker.
    </li>
  </List>
  <H2>The fine print</H2>
  <P
    >What kip is: <a class={link} href="{BASE_PATH}/about/">About</a>. What it
    stores and why:
    <a class={link} href="{BASE_PATH}/privacy/">Privacy Policy</a>. The rules:
    <a class={link} href="{BASE_PATH}/terms/">Terms</a>.</P
  >
</DocPage>
