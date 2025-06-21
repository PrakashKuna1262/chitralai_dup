import React from 'react';
import { Link } from 'react-router-dom';

const Terms = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Chitralai - Terms & Conditions</h1>
          <p className="text-gray-600">Last updated: June 18, 2025</p>
        </div>

        <div className="prose max-w-none">
          <p className="mb-6">
            Welcome to Chitralai, an AI-powered photo-sharing platform that leverages facial recognition to simplify how people retrieve and share images from events. Please read the following terms carefully before using our website, mobile application, or related services.
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p>
              By accessing or using chitralai, you agree to be bound by these Terms & Conditions, our Privacy Policy, and any additional guidelines we may post. These constitute a legal agreement under the Indian Contract Act, 1872. If you do not agree with these terms, please do not use our services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">2. Eligibility</h2>
            <p>
              To use chitralai, users must have the legal capacity to enter into a binding agreement as per the Indian Contract Act, 1872. By using the platform, you confirm that you are legally competent and authorized to use our services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">3. Account Registration</h2>
            <p>
              Users must provide accurate and complete information while creating an account. You are responsible for safeguarding your credentials. We are not liable for unauthorized access unless it is due to our negligence.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">4. Uploading Content & Ownership</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>You retain full ownership of the photos you upload.</li>
              <li>By uploading, you grant Chitralai a limited, non-exclusive license to use the content solely for delivering our services (e.g., facial recognition, link generation, etc.).</li>
              <li>Under Section 43A of the IT Act 2000, we are committed to protecting sensitive personal data.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">5. Facial Recognition & Consent</h2>
            <p className="mb-2">Chitralai uses AI-based facial recognition. By uploading an image, you affirm that:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>You own the rights to the image OR</li>
              <li>You have obtained valid consent from the identifiable persons in the image.</li>
            </ul>
            <p>Violation of consent-based usage may result in legal action under Section 66E of the IT Act (Privacy Violation).</p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">6. Sharing via QR Codes & Links</h2>
            <p>
              You may generate smart links or QR codes to access or share photo albums. While these links are unique, they are accessible by anyone who has them. You are responsible for managing how and with whom you share access.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">7. Content Restrictions</h2>
            <p className="mb-2">You may not upload or share content that:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Is illegal under Indian law, including content promoting violence, obscenity (Section 292 of IPC), or child exploitation (POCSO Act).</li>
              <li>Violates copyright laws (Copyright Act, 1957).</li>
              <li>Invades privacy or includes sensitive personal information without consent.</li>
            </ul>
            <p>Violation may lead to content removal or account termination under Section 79 of the IT Act (Safe Harbour).</p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">8. Data Protection & Privacy</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Your data is securely stored and processed in compliance with Indian laws.</li>
              <li>Users may request deletion of their data by contacting us.</li>
              <li>We comply with SPDI Rules, 2011 under the IT Act.</li>
              <li>For data collected via facial recognition, we follow principles of necessity, consent, and transparency.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">9. Free & Paid Plans</h2>
            <p>Chitralai offers both free and subscription-based premium services. We ensure:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Transparent pricing with no hidden fees.</li>
              <li>Users can cancel subscriptions anytime, as per consumer protection laws.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">10. Limitation of Liability</h2>
            <p className="mb-2">chitralai is not liable for:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Any misuse of shared QR codes or links.</li>
              <li>Facial recognition errors.</li>
              <li>Content uploaded by users.</li>
            </ul>
            <p>We act as an intermediary under Section 2(w) of the IT Act, with safe harbor protection unless notified of violations.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">11. Termination of Services</h2>
            <p className="mb-2">We reserve the right to:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Suspend or terminate accounts without notice if Terms are violated.</li>
              <li>Remove content that is inappropriate, illegal, or violates our policies.</li>
            </ul>
            <p>This is in accordance with Section 69A of the IT Act, which allows removal of public access to harmful data.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">12. Governing Law & Jurisdiction</h2>
            <p>These Terms are governed by Indian laws. Any dispute shall be resolved in courts located in Bhubaneswar, Odisha.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">13. Changes to Terms</h2>
            <p>We may update these Terms periodically. Continued use implies acceptance of updated terms. Users will be notified via email or app notifications where appropriate.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">14. Contact Information</h2>
            <p>For queries, concerns, or legal requests, please contact:</p>
            <p className="mt-2">Chitralai Support Team<br/>
            Email: <a href="mailto:chitralai.in@gmail.com" className="text-blue-600 hover:underline">chitralai.in@gmail.com</a></p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">15. User Feedback and Suggestions</h2>
            <p>If you submit feedback, ideas, or suggestions, Chitralai may use them for improving the platform without any obligation to compensate you, unless otherwise agreed in writing.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">16. Third-Party Services</h2>
            <p>Chitralai may link to or integrate third-party services like payment gateways or cloud storage. We are not responsible for their content, privacy policies, or practices. Please review their terms independently.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">17. Service Availability</h2>
            <p>We aim to provide uninterrupted services but cannot guarantee 100% uptime. Temporary outages may occur due to updates, maintenance, or technical issues. Chitralai will not be held responsible for such interruptions.</p>
          </section>
          <div className="mt-12 pt-6 border-t border-gray-200">
          <Link to="/" className="text-blue-600 hover:underline flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Home
          </Link>
        </div>
        </div>
      </div>
    </div>
  );
};

export default Terms;
