import type { Metadata } from 'next'
import { assetPath } from '../lib/paths'

const repositoryUrl = 'https://github.com/stoptalkingishh/openquiz'

export const metadata: Metadata = {
  title: 'Privacy Policy - OpenQuiz',
  description: 'Privacy policy for OpenQuiz, the free open-source study app.',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark text-neutral-900 dark:text-neutral-100">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <a href={assetPath('/')} className="text-sm font-semibold text-primary dark:text-primary-light hover:underline">← Back to OpenQuiz</a>
        <h1 className="text-3xl font-bold mt-4 mb-6">Privacy Policy</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-8">Last updated: September 21, 2026</p>

        <div className="space-y-8 text-[15px] leading-relaxed">
          <section>
            <h2 className="text-xl font-bold mb-2">1. Overview</h2>
            <p>OpenQuiz is a client-side static website and does not run an OpenQuiz application backend. The site is hosted through GitHub Pages, which may process ordinary web-request data to deliver the site. OpenQuiz also loads Google Analytics on page visits. Your study content is otherwise kept in your browser unless you choose a feature described below.</p>
          </section>
          <section>
            <h2 className="text-xl font-bold mb-2">2. Data stored in your browser</h2>
            <p>Custom quizzes, study progress, session history, folders, theme choices, guest identity, and AI settings are stored in your browser&rsquo;s <code>localStorage</code>. If you save an AI source prompt with a quiz, that prompt is part of the local quiz record. Clearing this site&rsquo;s browser data removes local records; use the in-app export tools first if you need a backup.</p>
          </section>
          <section>
            <h2 className="text-xl font-bold mb-2">3. Google sign-in, Drive, and sharing</h2>
            <p>If you sign in with Google, OpenQuiz requests Google identity information to show your account name, email address, and profile image in the app. Those details are stored in your browser. The app uses Google Drive&rsquo;s <code>drive.file</code> permission to create and manage files it creates in your Drive; it does not use an OpenQuiz server to receive your Drive data. The current Google-account Gemini beta also requests Google&rsquo;s Generative Language Semantic Retriever scope; review the Google consent screen before granting access.</p>
            <p className="mt-3">When you opt into sync, quizzes, progress, folders, and settings are written directly to an OpenQuiz folder in your Drive. When you create a Drive-shared quiz, a separate quiz file is written to your Drive and Google&rsquo;s access rules decide who can open it. Share exports exclude account identifiers, images, and saved AI source prompts, but anyone you share a quiz with can read the quiz material included in that export.</p>
          </section>
          <section>
            <h2 className="text-xl font-bold mb-2">4. AI generation</h2>
            <p>AI generation sends the text or file extraction you provide directly from your browser to the selected provider. For OpenAI-compatible providers, the configured endpoint, model, and API key are stored locally. For Gemini, you may use an API key stored locally or the Google-account Gemini option; both send your prompt to Google. Do not submit sensitive material unless you are comfortable with the selected provider processing it under that provider&rsquo;s terms and privacy policy.</p>
          </section>
          <section>
            <h2 className="text-xl font-bold mb-2">5. External actions you choose</h2>
            <p>The research button opens Google Search with the current question and answer in the search query. Quiz feedback and catalog-review buttons open GitHub Issue forms. Anything you submit there, including a catalog-review contact email, quiz link, attribution, and comments, is public on GitHub and subject to GitHub&rsquo;s policies. OpenQuiz does not copy private custom-quiz questions into feedback drafts automatically.</p>
          </section>
          <section>
            <h2 className="text-xl font-bold mb-2">6. Analytics, cookies, and service worker storage</h2>
            <p>Google Analytics is configured to measure aggregate site use. Google documents that a default web implementation can collect browser and device information, approximate location, page activity, session statistics, and a first-party analytics cookie. OpenQuiz does not intentionally send quiz content, email addresses, API keys, or other direct identifiers to Analytics. You can limit or clear cookies in your browser, and Google provides an <a href="https://tools.google.com/dlpage/gaoptout" className="text-primary dark:text-primary-light underline">Analytics opt-out browser add-on</a>.</p>
            <p className="mt-3">The service worker caches the app shell and bundled study data locally so the app can work offline. You can clear this cache through browser site-data controls.</p>
          </section>
          <section>
            <h2 className="text-xl font-bold mb-2">7. Your choices</h2>
            <p>You can use OpenQuiz as a guest, avoid Google sign-in and AI generation, clear local site data, revoke Drive access in your Google account, remove or change Drive sharing permissions, and delete or edit your own GitHub Issues. GitHub retains and manages public Issues under its own policies; deleting local data does not remove data already shared with Google Drive, an AI provider, Google Search, GitHub, or a quiz recipient.</p>
          </section>
          <section>
            <h2 className="text-xl font-bold mb-2">8. Changes and contact</h2>
            <p>We may update this policy by changing the version in the repository and the date above. Questions can be raised in the <a href={`${repositoryUrl}/issues/new`} className="text-primary dark:text-primary-light underline">OpenQuiz issue tracker</a>. Do not include sensitive personal information in a public Issue.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
