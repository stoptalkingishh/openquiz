import type { Metadata } from 'next'
import { assetPath } from '../lib/paths'

export const metadata: Metadata = {
  title: 'Terms of Use - OpenQuiz',
  description: 'Terms of use for OpenQuiz, the free open-source study app.',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark text-neutral-900 dark:text-neutral-100">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <a
          href={assetPath('/')}
          className="text-sm font-semibold text-primary dark:text-primary-light hover:underline"
        >
          ← Back to OpenQuiz
        </a>

        <h1 className="text-3xl font-bold mt-4 mb-6">Terms of Use</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-8">
          Last updated: September 19, 2026
        </p>

        <div className="space-y-8 text-[15px] leading-relaxed">
          <section>
            <h2 className="text-xl font-bold mb-2">1. Acceptance of these terms</h2>
            <p>
              By accessing or using OpenQuiz (&ldquo;the Service&rdquo;), you agree to these
              Terms of Use. If you do not agree, please do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">2. What OpenQuiz is</h2>
            <p>
              OpenQuiz is a free, open-source study application for creating and practicing
              quizzes, flashcards, and simulations. It runs entirely in your browser as a
              static site and does not operate its own backend server. Your study data is
              stored on your device (and, only if you opt in, in your own Google Drive).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">3. Your content</h2>
            <p>
              You retain ownership of the quizzes, notes, and study material you create with
              the Service. By using optional sharing features you may publish a quiz for
              other users; you are responsible for ensuring you have the rights to any
              content you publish or import.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">4. Acceptable use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Use the Service to distribute unlawful, infringing, or harmful content.</li>
              <li>Attempt to gain unauthorized access to any part of the Service.</li>
              <li>Misrepresent the source or authorship of study content.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">5. Bundled and third-party content</h2>
            <p>
              The Service bundles study content (vocabulary, practice questions, flashcards)
              that is licensed separately from the OpenQuiz source code. This content is
              provided for educational purposes only. Exam-aligned material is written to
              reference publicly-available exam objectives and is <strong>not</strong> official
              exam material. See <a href={assetPath('/')} className="text-primary dark:text-primary-light underline">THIRD-PARTY-NOTICES.md</a> in the
              repository for attributions and licenses.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">6. Intellectual property &amp; licensing</h2>
            <p>
              The OpenQuiz source code is free software licensed under the GNU
              Affero General Public License v3.0 (or later). It is free for
              individual, personal, educational, and non-commercial use. If you
              use OpenQuiz in a corporate or other for-profit environment and
              prefer not to comply with the AGPL&rsquo;s copyleft obligations, a
              paid commercial license is available — contact the creator (see the
              LICENSE file in the repository).
            </p>
            <p>
              CompTIA, Network+, Security+, CySA+, PenTest+, Cloud+, Linux+, and
              SecurityX are trademarks of the Computing Technology Industry Association
              (CompTIA). OpenQuiz is not affiliated with or endorsed by CompTIA or any
              other certification body.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">7. Third-party services</h2>
            <p>
              If you enable Google Drive sync, the Service uses Google&rsquo;s OAuth and Drive
              APIs to store your data in your own Google Drive account, and Google&rsquo;s terms
              and privacy policy apply to that data. If you use the AI quiz generator, you
              supply your own API key and your prompts are sent directly from your browser to
              the AI provider you choose; that provider&rsquo;s terms apply.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">8. No warranty</h2>
            <p>
              The Service is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without
              warranties of any kind, express or implied, including but not limited to
              merchantability, fitness for a particular purpose, or non-infringement. Study
              content may contain errors and is not a substitute for official exam preparation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">9. Limitation of liability</h2>
            <p>
              To the maximum extent permitted by law, the OpenQuiz contributors shall not be
              liable for any indirect, incidental, special, consequential, or punitive damages,
              or any loss of data, profits, or goodwill, arising out of or related to your use
              of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">10. Changes to these terms</h2>
            <p>
              We may update these Terms from time to time. The most current version will
              always be available in the project repository, and the &ldquo;Last updated&rdquo;
              date above reflects the latest revision.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2">11. Contact</h2>
            <p>
              Questions about these Terms can be opened as an issue in the project repository
              on GitHub.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
