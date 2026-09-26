import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { PageHero } from './section';
import { LEGAL_CONTACT_EMAIL, LEGAL_NAME, MINIMUM_AGE, TERMS_EFFECTIVE_DATE } from '@/lib/legal';

function Doc({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-3xl px-4 py-10 text-[15px] leading-7 sm:px-6 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:leading-snug [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">{children}</div>;
}

function Contact() {
  return LEGAL_CONTACT_EMAIL
    ? <>email us at <a className="font-medium text-primary hover:underline" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a></>
    : <>contact us through our <Link to="/help" className="font-medium text-primary hover:underline">Help page</Link></>;
}

function Updated() {
  return <p className="text-sm text-muted-foreground">Effective {TERMS_EFFECTIVE_DATE}.</p>;
}

/* ============================================================== Terms of Use */
export function TermsPage() {
  return (
    <main>
      <PageHero eyebrow="Legal" title="Terms of Use" body={`The rules for using ${LEGAL_NAME}. Please read them. By creating an account you agree to them.`} />
      <Doc>
        <Updated />
        <h2>1. Who we are and what we do</h2>
        <p>{LEGAL_NAME} is an online marketplace that helps people in Zambia find vehicles, parts, dealers, mechanics, servicing companies and import agents. We provide the platform. We are not a party to any sale, service or import arrangement between users, we do not own the vehicles or parts listed, and we do not handle payments between buyers and sellers.</p>

        <h2>2. You must be {MINIMUM_AGE} or older</h2>
        <p>You may only create an account or use {LEGAL_NAME} if you are at least {MINIMUM_AGE} years old and able to enter into a binding agreement. When you sign up you confirm this. We may close accounts that we believe belong to someone under {MINIMUM_AGE}.</p>

        <h2>3. Your account</h2>
        <ul>
          <li>Give accurate information, including your name and phone number, and keep it up to date.</li>
          <li>Keep your password secret. You are responsible for what happens on your account.</li>
          <li>Business accounts (dealers, mechanics, servicing companies, parts sellers and import agents) must represent a real business that you are authorised to act for.</li>
          <li>Tell us straight away if you think someone else has used your account.</li>
        </ul>

        <h2>4. Listings</h2>
        <p>If you list a vehicle or part, you confirm that:</p>
        <ul>
          <li>you own it or are authorised to sell it, and it is not stolen, subject to undisclosed finance, or otherwise unlawful to sell;</li>
          <li>the description, price, photos, mileage, registration, duty and import details are accurate and not misleading;</li>
          <li>the photos are of the actual item (or clearly marked otherwise) and you have the right to use them;</li>
          <li>you will mark the listing as sold, or remove it, once it is no longer available.</li>
        </ul>
        <p>There is no limit on how many listings you can publish. We may hold, edit the category of, or remove listings that break these terms or look fraudulent.</p>

        <h2>5. Verification and badges</h2>
        <p>Verification is optional. A <b>“Verified vehicle”</b> badge means our team checked documents the seller uploaded for that car (such as the registration book or import papers) and they appeared to match the listing. A <b>“Verified dealer”</b> or <b>“Verified business”</b> badge means we reviewed the business’s details.</p>
        <p>Badges help you assess a listing, but they are not a guarantee of the vehicle’s condition, history, ownership or legal status. Always inspect the vehicle, check the chassis and engine numbers against the original documents, and use official channels (such as the RTSA, ZRA and the Zambia Police) before you pay. Uploading false or altered documents is a serious breach of these terms and may be reported to the authorities.</p>

        <h2>6. Buying safely</h2>
        <ul>
          <li>Meet in a safe public place and inspect the vehicle or part in person.</li>
          <li>Never pay a deposit or send money before you have seen the item and its original documents.</li>
          <li>Be cautious of prices that seem too good to be true, or pressure to pay quickly.</li>
          <li>Report suspicious listings or messages using the Report button.</li>
        </ul>

        <h2>7. Messages, reviews and your content</h2>
        <p>You are responsible for what you post, including listings, messages, photos and reviews. Reviews must reflect a genuine experience. You keep ownership of your content, but you give {LEGAL_NAME} a non-exclusive, royalty-free licence to host, display, resize and share it on the platform so the service can work (for example, showing your listing photos to buyers).</p>

        <h2>8. What you must not do</h2>
        <ul>
          <li>post false, misleading, fraudulent or illegal listings, or impersonate someone else;</li>
          <li>harass, threaten or scam other users, or ask them to pay outside a safe arrangement;</li>
          <li>send spam, or collect other users’ contact details for unrelated marketing;</li>
          <li>interfere with the platform, try to access accounts or data that aren’t yours, or scrape the site at scale;</li>
          <li>upload viruses, or content that is offensive, discriminatory or infringes someone else’s rights.</li>
        </ul>

        <h2>9. Moderation and suspension</h2>
        <p>We may review reports, remove content, limit features, or suspend or close accounts that break these terms or put other users at risk. Where it is safe and lawful to do so, we will tell you why.</p>

        <h2>10. Fees</h2>
        <p>Listing on {LEGAL_NAME} is currently free. If we introduce paid features, we will tell you the price before you are charged, and nothing will be charged without your agreement.</p>

        <h2>11. Our responsibility</h2>
        <p>We work to keep {LEGAL_NAME} accurate, safe and available, but the service is provided “as is”. To the extent permitted by the laws of Zambia, we are not responsible for the actions of users, the accuracy of listings, or losses arising from transactions between users. Nothing in these terms limits rights you have that cannot be limited by law.</p>

        <h2>12. Privacy</h2>
        <p>How we handle your personal data is explained in our <Link to="/privacy" className="font-medium text-primary hover:underline">Privacy Policy</Link>. Our use of cookies and similar storage is explained in our <Link to="/cookies" className="font-medium text-primary hover:underline">Cookie Policy</Link>.</p>

        <h2>13. Changes to these terms</h2>
        <p>We may update these terms as the service grows. If the changes are significant, we will ask you to accept the new version the next time you use {LEGAL_NAME}.</p>

        <h2>14. Law and contact</h2>
        <p>These terms are governed by the laws of the Republic of Zambia. If you have a question or complaint, <Contact />.</p>
      </Doc>
    </main>
  );
}

/* ============================================================ Privacy Policy */
export function PrivacyPage() {
  return (
    <main>
      <PageHero eyebrow="Legal" title="Privacy Policy" body="What personal information we collect, why we collect it, who can see it and your rights." />
      <Doc>
        <Updated />
        <h2>1. Who is responsible for your data</h2>
        <p>{LEGAL_NAME} is responsible for the personal data processed through this website and app. We handle personal data in line with Zambia’s Data Protection Act No. 3 of 2021.</p>

        <h2>2. What we collect</h2>
        <ul>
          <li><b>Account details:</b> your name, email address, phone number, account type, password (stored only in encrypted form by our authentication provider), and your confirmation that you are {MINIMUM_AGE} or older and accept our terms.</li>
          <li><b>Profile and business details:</b> such as your location, business name, contact numbers, opening hours, services and photos you add.</li>
          <li><b>Listings:</b> vehicle and part details, photos and documents you upload.</li>
          <li><b>Verification:</b> documents you upload to verify a vehicle (for example the registration book or import papers) and, for business verification, a selfie taken in the app and business documents.</li>
          <li><b>Messages and activity:</b> conversations, viewing requests, saved items, reviews and reports.</li>
          <li><b>Technical data:</b> such as your IP address, device and browser type, and security logs, which our hosting providers record to keep the service running and secure.</li>
        </ul>

        <h2>3. Why we use it</h2>
        <ul>
          <li>to create and run your account and show your listings and profile (to perform our agreement with you);</li>
          <li>to let buyers and sellers contact each other and arrange viewings;</li>
          <li>to review verification requests and show badges;</li>
          <li>to keep users safe: preventing fraud, handling reports, and enforcing our terms (our legitimate interests);</li>
          <li>to send you service messages, such as notifications about your listings and messages;</li>
          <li>to meet legal obligations and respond to lawful requests from authorities.</li>
        </ul>
        <p>We do not sell your personal data, and we do not use it for third-party advertising.</p>

        <h2>4. Who can see your information</h2>
        <ul>
          <li><b>Everyone:</b> your listings, your public profile or business profile (name, location, photos, ratings and reviews) and verification badges.</li>
          <li><b>Other users you deal with:</b> your phone number is shown only when a signed-in user chooses to reveal it on one of your listings or profiles, and your messages are visible only to the people in the conversation.</li>
          <li><b>{LEGAL_NAME} reviewers and administrators:</b> verification documents and selfies, and reported content. These are kept in private storage and are never shown publicly.</li>
          <li><b>Service providers:</b> companies that host our database, files and website and deliver our emails, acting on our instructions.</li>
          <li><b>Authorities:</b> when the law requires it, or to protect people from fraud or harm.</li>
        </ul>

        <h2>5. Where your data is stored</h2>
        <p>Our service providers may store and process data on servers outside Zambia. Where this happens, we rely on providers that protect data with appropriate security measures, including encryption in transit.</p>

        <h2>6. How long we keep it</h2>
        <p>We keep your account data while your account is open. Listings, messages and verification records are kept while they are needed to provide the service, resolve disputes, prevent fraud and meet legal obligations, and are then deleted or anonymised. You can ask us to delete your account at any time (see below).</p>

        <h2>7. Security</h2>
        <p>Access to data is restricted by account, verification documents are held in private storage and shared with reviewers only through short-lived links, and photos you upload have their location data removed. No system is perfectly secure, so please use a strong password that you don’t use elsewhere.</p>

        <h2>8. Your rights</h2>
        <p>Under the Data Protection Act you can ask us to:</p>
        <ul>
          <li>tell you what personal data we hold about you and give you a copy;</li>
          <li>correct data that is wrong or incomplete (you can edit most details yourself in your dashboard);</li>
          <li>delete your data, or stop or restrict using it, where the law allows;</li>
          <li>withdraw consent you have given, where we rely on consent.</li>
        </ul>
        <p>To make a request, <Contact />. If you are unhappy with how we handle your data, you can also complain to the Office of the Data Protection Commissioner in Zambia.</p>

        <h2>9. Age limit</h2>
        <p>{LEGAL_NAME} is only for people aged {MINIMUM_AGE} or older. We do not knowingly collect data from anyone younger. If you believe a minor has created an account, please tell us and we will close it.</p>

        <h2>10. Cookies</h2>
        <p>We use only the cookies and browser storage needed for the site to work. See our <Link to="/cookies" className="font-medium text-primary hover:underline">Cookie Policy</Link>.</p>

        <h2>11. Changes</h2>
        <p>We will update this policy when our practices change, and tell you about significant changes in the app.</p>
      </Doc>
    </main>
  );
}

/* ============================================================= Cookie Policy */
export function CookiesPage() {
  return (
    <main>
      <PageHero eyebrow="Legal" title="Cookie Policy" body="The small amount of information we store in your browser, and why." />
      <Doc>
        <Updated />
        <h2>What we use</h2>
        <p>{LEGAL_NAME} uses cookies and similar browser storage (such as local storage) only where they are needed for the site to work or to remember choices you make. We do not use advertising or tracking cookies.</p>
        <div className="mt-4 overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="bg-muted/60"><tr><th className="p-3 font-semibold">Purpose</th><th className="p-3 font-semibold">What it does</th><th className="p-3 font-semibold">How long</th></tr></thead>
            <tbody className="divide-y">
              <tr><td className="p-3 align-top font-medium">Signing in (essential)</td><td className="p-3 align-top">Keeps you signed in securely as you move between pages.</td><td className="p-3 align-top">Until you sign out, or the session ends if you didn’t choose “Remember me”</td></tr>
              <tr><td className="p-3 align-top font-medium">Your preferences</td><td className="p-3 align-top">Remembers choices such as which home page sections you minimised, the cookie notice, and reminders you snoozed.</td><td className="p-3 align-top">Until you clear your browser data</td></tr>
            </tbody>
          </table>
        </div>

        <h2>Other services</h2>
        <p>Our pages load fonts from Google Fonts, which means Google receives your IP address when the font files are downloaded. Maps or other features added in future may use their own cookies; we will update this page before they are introduced.</p>

        <h2>Your choices</h2>
        <p>You can delete or block cookies and site data in your browser settings. If you block essential storage, you will not be able to stay signed in.</p>

        <h2>Questions</h2>
        <p>If you have a question about this policy, <Contact />.</p>
      </Doc>
    </main>
  );
}
