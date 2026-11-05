import type { Metadata } from "next";
import { LegalNotice } from "@/components/site/LegalNotice";
import { PageHeader } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Privacy policy", description: "What Aged Takes collects, why, and your choices.", path: "/privacy" });

export default function PrivacyPage() {
  return (
    <div className="wrap max-w-3xl py-12">
      <PageHeader kicker="Legal" title="Privacy policy" />
      <LegalNotice />
      <div className="prose-case">
        <p><em>Last updated: November 3, 2026.</em> This policy explains what information Aged Takes (&quot;we&quot;) collects from visitors and how we use it.</p>
        <h2>What we collect</h2>
        <ul>
          <li><strong>Newsletter subscribers:</strong> your email address, when and how you gave consent, and your subscription status. We send email only after you confirm.</li>
          <li><strong>Submissions:</strong> what you send us. Your name and email are optional, kept private, and used only to follow up.</li>
          <li><strong>Reader accounts (optional):</strong> your email address for sign-in and the people you follow.</li>
          <li><strong>Security data:</strong> a one-way hash of your IP address, used briefly to prevent spam and abuse. We do not store raw IP addresses.</li>
          <li><strong>Server logs:</strong> standard technical logs kept by our hosting provider for a limited time.</li>
        </ul>
        <h2>What we don&apos;t do</h2>
        <ul>
          <li>We don&apos;t sell personal information.</li>
          <li>We don&apos;t publish submitters&apos; identities.</li>
          <li>We don&apos;t send marketing email without your confirmed consent.</li>
        </ul>
        <h2>Service providers</h2>
        <p>We use Supabase (database and sign-in), Vercel (hosting), Resend (email delivery) and Anthropic (AI research assistance, which receives public source material, not visitor data). Advertising partners, if used, will be listed here with their cookie practices before they are enabled.</p>
        <h2>Your choices</h2>
        <p>Every email has a one-click unsubscribe link. You can ask us to access, correct or delete your personal information using the contact details on the About page.</p>
        <h2>People we write about</h2>
        <p>Our journalism concerns the public statements and documented public activity of public figures. We do not collect unnecessary personal data about them, and we offer a right of reply on every case.</p>
        <h2>Children</h2>
        <p>The site is not directed at children under 16, and we don&apos;t knowingly collect their information.</p>
      </div>
    </div>
  );
}
