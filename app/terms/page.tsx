import type { Metadata } from 'next'
import { assetPath } from '../lib/paths'

const repositoryUrl = 'https://github.com/stoptalkingishh/openquiz'

export const metadata: Metadata = {
  title: 'Terms of Use - OpenQuiz',
  description: 'Terms of use for OpenQuiz, the free open-source study app.',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark text-neutral-900 dark:text-neutral-100">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <a href={assetPath('/')} className="text-sm font-semibold text-primary dark:text-primary-light hover:underline">← Back to OpenQuiz</a>
        <h1 className="text-3xl font-bold mt-4 mb-6">Terms of Use</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-8">Last updated: September 21, 2026</p>

        <div className="space-y-8 text-[15px] leading-relaxed">
          <section>
            <h2 className="text-xl font-bold mb-2">1. Acceptance and service</h2>
            <p>By using OpenQuiz, you agree to these Terms. OpenQuiz is a free, open-source study application that runs as a static website. It does not operate an OpenQuiz application backend. Your browser stores study data locally unless you choose an optional third-party feature.</p>
          </section>
          <section>
            <h2 className="text-xl font-bold mb-2">2. Your content and responsible use</h2>
            <p>You keep ownership of content you create. You are responsible for ensuring that anything you import, generate, share, or submit does not violate law, contracts, confidentiality obligations, or another person&rsquo;s intellectual-property rights.</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Do not upload or distribute copied certification exams, confidential answer keys, or copyrighted course materials unless you have permission.</li>
              <li>Do not misrepresent authorship, licensing, sources, or exam affiliation.</li>
              <li>Do not use the Service to distribute unlawful, infringing, harmful, or malicious material.</li>
            </ul>
          </section>
          <section>
            <h2 className="text-xl font-bold mb-2">3. Sharing and catalog review</h2>
            <p>Sharing a quiz by snapshot link, JSON export, or Google Drive does not publish it in an OpenQuiz catalog. You choose recipients and permissions for Google Drive sharing; Google controls those permissions and access.</p>
            <p className="mt-3">A catalog-review request opens a public GitHub Issue. The contact email, quiz link, attribution, and discussion you submit are public. By asking us to add a quiz to an OpenQuiz catalog, you confirm that you have the necessary rights and grant the project a worldwide, non-exclusive, royalty-free license to review, reproduce, adapt, distribute, and display that submitted content in connection with OpenQuiz. Accepted content must be compatible with the repository&rsquo;s AGPL-3.0-or-later license or include a clearly documented compatible license.</p>
          </section>
          <section>
            <h2 className="text-xl font-bold mb-2">4. Feedback and public discussions</h2>
            <p>Quiz feedback and catalog-review requests use GitHub Issues. Do not include API keys, private Drive links, personal information you do not want public, or source material you cannot publish. Maintainers may reply in the Issue and link a fix or content pull request to the discussion.</p>
          </section>
          <section>
            <h2 className="text-xl font-bold mb-2">5. Open-source license and bundled content</h2>
            <p>The OpenQuiz source code is licensed under the GNU Affero General Public License v3.0 or later. The AGPL permits commercial use, modification, and redistribution when its conditions are met; it does not make a non-commercial-only restriction. See the <a href={`${repositoryUrl}/blob/main/LICENSE`} className="text-primary dark:text-primary-light underline">LICENSE</a> file for the controlling terms.</p>
            <p className="mt-3">Practice material is educational and may contain errors. It is not official exam content and is not a substitute for official preparation materials. See the <a href={`${repositoryUrl}/blob/main/CONTENT_POLICY.md`} className="text-primary dark:text-primary-light underline">Content Policy</a> and <a href={`${repositoryUrl}/blob/main/THIRD_PARTY_NOTICES.md`} className="text-primary dark:text-primary-light underline">Third-Party Notices</a> for content and dependency information.</p>
            <p className="mt-3">CompTIA, Network+, Security+, CySA+, PenTest+, Cloud+, Linux+, and SecurityX are trademarks of CompTIA. OpenQuiz is not affiliated with or endorsed by CompTIA or any other certification body.</p>
          </section>
          <section>
            <h2 className="text-xl font-bold mb-2">6. Third-party services</h2>
            <p>Optional Google Drive sync and sharing use Google OAuth, Google Drive, and Google Picker directly from your browser. AI generation sends material directly to the provider you select: an OpenAI-compatible endpoint, Google Gemini using your API key, or the Google-account Gemini option. The research tool opens a Google search containing the selected question and answer. GitHub handles submitted Issues. Those services&rsquo; terms and privacy policies apply to their handling of your data.</p>
          </section>
          <section>
            <h2 className="text-xl font-bold mb-2">7. No warranty and limitation of liability</h2>
            <p>OpenQuiz is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties of any kind. To the maximum extent permitted by law, OpenQuiz contributors are not liable for indirect, incidental, special, consequential, or punitive damages, or loss of data, profits, or goodwill arising from use of the Service.</p>
          </section>
          <section>
            <h2 className="text-xl font-bold mb-2">8. Changes and contact</h2>
            <p>We may update these Terms by changing the version in the repository and the date above. For questions, use the <a href={`${repositoryUrl}/issues/new`} className="text-primary dark:text-primary-light underline">OpenQuiz issue tracker</a>. Report security vulnerabilities through the repository&rsquo;s security reporting channel rather than a public Issue.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
