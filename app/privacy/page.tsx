import type { Metadata } from 'next'
import { assetPath } from '../lib/paths'

export const metadata: Metadata = {
  title: 'Privacy Policy - OpenQuiz',
  description: 'Privacy policy for OpenQuiz, the free open-source study app.',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark text-neutral-900 dark:text-neutral-100">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <a
          href={assetPath('/')}
          className="text-sm font-semibold text-primary dark:text-primary-light hover:underline"
        >
          ← Back to OpenQuiz
        </a>

        <h1 className="text-3xl font-bold mt-4 mb-6">Privacy Policy</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-8">
          Last updated: September 19, 2026
        </p>

        <div className="space-y-8 text-[15px] leading-relaxed">
          <section>
            <h2 className="text-xl font-bold mb-2">1. Overview</h2>
            <p>
              OpenQuiz is a fully client-side, static web application. It has <strong>no
              backend server</strong>. The site uses Google Analytics to measure aggregate
              traffic and feature usage; Google may process technical information such as
              your browser, device, approximate location, and pages viewed. Everything you
              study stays on your device unless you explicitly choose to sync it to your own
              Google Drive.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">2. Data stored on your device</h2>
            <p>
              Your quizzes, study progress, session history, and settings are stored in your
              browser&rsquo;s <code>localStorage</code>. This data never leaves your device
              and can be deleted at any time by clearing your browser&rsquo;s site data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">3. Optional Google Drive sync</h2>
            <p>
              If you choose to sign in with Google, the Service uses Google&rsquo;s OAuth to
              identify you and the Google Drive API to store your quiz and progress data in a
              private, app-specific folder in <strong>your own</strong> Google Drive. OpenQuiz
              does not operate a server and never receives or stores your data or your Google
              credentials; data flows directly between your browser and your Google Drive.
              Google&rsquo;s Privacy Policy applies to the information Google processes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">4. Optional AI quiz generation</h2>
            <p>
              The AI quiz generator is &ldquo;bring your own key.&rdquo; If you use it, you
              provide your own API key (stored locally on your device) and your notes are sent
              directly from your browser to the AI provider you select. OpenQuiz does not
              receive, store, or transmit your key or your notes; the chosen provider&rsquo;s
              privacy policy governs its handling of your request.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">5. Text-to-speech</h2>
            <p>
              Read-aloud uses your browser&rsquo;s built-in speech synthesis and does not send
              text to any server.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">6. Cookies and tracking</h2>
            <p>
              Google Analytics may use cookies or similar storage for measurement. The service
              worker caches static assets (HTML, CSS, JavaScript, and bundled study data)
              locally so the app works offline. You can limit cookies through your browser
              settings or browser privacy tools.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">7. Children&rsquo;s privacy</h2>
            <p>
              The Service does not knowingly collect personal information from anyone, including
              children. Because no personal data is collected by OpenQuiz itself, there is no
              account or profile we retain that could relate to a child.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">8. Changes to this policy</h2>
            <p>
              We may update this policy from time to time. The current version will always be
              available in the project repository, and the &ldquo;Last updated&rdquo; date above
              reflects the latest revision.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">9. Contact</h2>
            <p>
              Questions about this policy can be opened as an issue in the project repository
              on GitHub.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
