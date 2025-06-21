
import { Link } from 'react-router-dom';

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-gray-600">Last updated: June 19, 2025</p>
        </div>
        
        <div className="prose max-w-none">
          <p className="mb-6">
            Thank you for choosing to be part of chitralai ("Company," "we," "us," or "our"). 
            We are committed to safeguarding your personal information and respecting your privacy 
            in compliance with applicable Indian data protection laws, including the Digital Personal 
            Data Protection Act, 2023.
          </p>
          
          <p className="mb-6">
            This Privacy Policy explains how we collect, use, store, disclose, and protect your 
            information when you access or use our website www.chitralai.in, mobile application, 
            and all related services (collectively, the "Services").
          </p>
          
          <p className="mb-8">
            If you have any questions or concerns, contact us at 
            <a href="mailto:chitralai.in@gmail.com" className="text-blue-600 hover:underline"> 
              chitralai.in@gmail.com
            </a>.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">1. What Information Do We Collect?</h2>
          <p className="mb-4">We collect the following categories of data:</p>
          
          <h3 className="font-medium text-gray-900 mt-4 mb-2">a. Personal Information:</h3>
          <ul className="list-disc pl-6 mb-4 space-y-1">
            <li>Name, email address, mobile number</li>
            <li>User-generated content (e.g., uploaded images)</li>
            <li>Login details (including social login data, if applicable)</li>
          </ul>
          
          <h3 className="font-medium text-gray-900 mt-4 mb-2">b. Usage Data:</h3>
          <ul className="list-disc pl-6 mb-4 space-y-1">
            <li>Browser type, access times</li>
            <li>Referring URLs, session information</li>
          </ul>
          
          <h3 className="font-medium text-gray-900 mt-4 mb-2">c. Media Content:</h3>
          <ul className="list-disc pl-6 mb-4 space-y-1">
            <li>Photos and videos you upload for identification and sharing</li>
            <li>Facial recognition data (if consented)</li>
          </ul>
          
          <h3 className="font-medium text-gray-900 mt-4 mb-2">d. Metadata:</h3>
          <ul className="list-disc pl-6 mb-8 space-y-1">
            <li>Timestamps, location (if permitted), face tags</li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">2. How Do We Use Your Information?</h2>
          <p className="mb-4">We use your data to:</p>
          <ul className="list-disc pl-6 mb-8 space-y-1">
            <li>Provide and operate chitralai's services</li>
            <li>Enable face recognition and image retrieval</li>
            <li>Generate links/QR codes for easy sharing</li>
            <li>Personalize your experience</li>
            <li>Improve security, detect abuse or fraud</li>
            <li>Comply with legal obligations</li>
            <li>Respond to your queries or feedback</li>
          </ul>
          <p className="mb-8">
            We ensure lawful processing by obtaining your clear consent before collecting sensitive personal data.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">3. Will Your Information Be Shared With Anyone?</h2>
          <p className="mb-4">We do not sell your data.</p>
          <p className="mb-2">We may share your data with:</p>
          <ul className="list-disc pl-6 mb-4 space-y-1">
            <li><span className="font-medium">Service Providers:</span> To enable technical and customer support</li>
            <li><span className="font-medium">Legal Authorities:</span> If required under applicable law or court order</li>
            <li><span className="font-medium">With Your Consent:</span> For additional features or integrations</li>
          </ul>
          <p className="mb-8">All third parties are contractually bound to protect your data.</p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">4. Do We Use Cookies and Tracking Technologies?</h2>
          <p className="mb-8">
            Yes. We use cookies and similar tools to improve performance, remember preferences, 
            and analyze user behavior. You can manage cookie settings in your browser.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">5. How Do We Handle Social Logins?</h2>
          <p className="mb-8">
            When you log in using platforms like Google, we collect only limited profile details 
            (such as name and email) to authenticate you. This information is not shared further without consent.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">6. What Is Our Stance on Third-Party Links?</h2>
          <p className="mb-8">
            Our Services may contain links to other websites. We are not responsible for their privacy practices. 
            Please review their respective privacy policies.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">7. How Long Do We Keep Your Information?</h2>
          <p className="mb-8">
            We retain your personal data only for as long as necessary for the purposes listed above 
            or as mandated by law. You may request deletion at any time.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">8. How Do We Keep Your Information Safe?</h2>
          <p className="mb-4">We implement physical, technical, and administrative safeguards including:</p>
          <ul className="list-disc pl-6 mb-4 space-y-1">
            <li>Data encryption during storage and transmission</li>
            <li>Access controls and firewalls</li>
            <li>Regular security audits</li>
          </ul>
          <p className="mb-8">Despite our efforts, no system is 100% secure.</p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">9. What Are Your Privacy Rights?</h2>
          <p className="mb-4">Under Indian law, you have the right to:</p>
          <ul className="list-disc pl-6 mb-4 space-y-1">
            <li>Access your personal data</li>
            <li>Correct inaccurate or outdated information</li>
            <li>Withdraw consent at any time</li>
            <li>Request deletion of your data (subject to legal limitations)</li>
          </ul>
          <p className="mb-8">
            To exercise your rights, email us at 
            <a href="mailto:chitralai.in@gmail.com" className="text-blue-600 hover:underline">
              chitralai.in@gmail.com
            </a>.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">10. Do-Not-Track Signals</h2>
          <p className="mb-8">
            We currently do not respond to browser "Do-Not-Track" signals. However, we may consider this feature in future updates.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">11. Rights of Indian Citizens (Including Minors)</h2>
          <p className="mb-8">
            We do not knowingly collect data from users under 18 without parental consent. 
            If you believe a minor has shared data with us, please write to us for its removal.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">12. Do We Make Updates to This Policy?</h2>
          <p className="mb-8">
            Yes. We may revise this Privacy Policy as required by law or business needs. 
            Updated versions will be posted on this page with a revised "Effective Date." 
            Significant changes will be notified via email or app notification.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">13. How Can You Contact Us?</h2>
          <p className="mb-4">If you have questions or concerns about this policy, write to:</p>
          <address className="not-italic mb-8">
            chitralai Team<br />
            Email: <a href="mailto:chitralai.in@gmail.com" className="text-blue-600 hover:underline">chitralai.in@gmail.com</a><br />
            Website: <a href="https://www.chitralai.in" className="text-blue-600 hover:underline">www.chitralai.in</a>
          </address>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">14. How Can You Review, Update, or Delete Your Data?</h2>
          <p className="mb-8">
            To manage or delete your data, email us at 
            <a href="mailto:chitralai.in@gmail.com" className="text-blue-600 hover:underline">
              chitralai.in@gmail.com
            </a> or use the options in your account dashboard.
          </p>
        </div>
        
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
  );
};

export default PrivacyPolicy;
