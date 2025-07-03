import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    question: 'How does the AI categorization work?',
    answer:
      'Our AI analyzes your photos to identify people, places, objects, and events. It uses machine learning to recognize patterns and categorize your images automatically, making them easily searchable without you having to manually tag them.',
  },
  {
    question: 'Is my data secure?',
    answer:
      'Absolutely. We use end-to-end encryption to ensure your photos are only accessible to you and those you choose to share them with. Your privacy is our top priority, and we never use your photos for training our AI without explicit permission.',
  },
  {
    question: 'Can I access my photos offline?',
    answer:
      'Yes, you can mark specific albums or photos as "Available Offline" in the mobile app. These will be stored locally on your device so you can access them even without an internet connection.',
  },
  {
    question: 'How do I share my photos with friends and family?',
    answer:
      'Chitralai makes sharing simple. You can create shareable links for individual photos or entire albums, set permissions for who can view or edit, and even collaborate on shared albums with family members.',
  },
  {
    question: 'What happens if I exceed my storage limit?',
    answer:
      "If you approach your storage limit, we'll notify you and provide options to upgrade to a plan with more storage. Your existing photos will remain safe and accessible even if you exceed your limit temporarily.",
  },
  {
    question: 'Can I cancel my subscription at any time?',
    answer:
      "Yes, you can cancel your subscription at any time. If you cancel, you'll continue to have access to your premium features until the end of your billing cycle. After that, you'll be downgraded to the Basic plan but will still have access to all your photos.",
  },
];

const FAQ = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const handleMouseEnter = () => setIsPaused(true);
  const handleMouseLeave = () => setIsPaused(false);
  const handleTouchStart = () => setIsPaused(true);
  const handleTouchEnd = (e: React.TouchEvent) => {
    // Only resume if touch ends outside the partner container
    const target = e.target as HTMLElement;
    const partnerContainer = target.closest('.partner-container');
    if (partnerContainer) {
      const touch = e.changedTouches[0];
      const elementAtTouch = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!partnerContainer.contains(elementAtTouch)) {
        setIsPaused(false);
      }
    } else {
      setIsPaused(false);
    }
  };

  return (
    <div id="faq" className="bg-gradient-to-b from-white to-blue-50/50 py-12 sm:py-16 md:py-20 lg:py-24 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Partners Section */}
        <div className="mb-16 mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.0 }}
            className="text-center mb-6"
          >
            <h3 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-4">
              Our Partners
            </h3>
            <div className="w-full overflow-hidden py-4">
              <motion.div 
                className="flex items-center partner-container"
                animate={{
                  x: ['0%', '-100%'],
                }}
                transition={{
                  duration: 10,
                  repeat: Infinity,
                  ease: 'linear',
                }}
                style={{
                  animationPlayState: isPaused ? 'paused' : 'running'
                }}
              >
                {[
                  // First set of logos
                  ...[
                    {
                      src: "https://remoters.net/wp-content/uploads/2020/06/draper-startup-house.png",
                      alt: "Draper"
                    },
                    {
                      src: "https://upload.wikimedia.org/wikipedia/commons/4/40/T-Hub_Logo-PNG.png",
                      alt: "T-Hub"
                    },
                    {
                      src: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSHpS7l6XHJgFCx3-FWabYpvaD4eSbGoIpVRSVsOgnCPue71d2UYOLNqxPdJ_gdijKzgw&usqp=CAU",
                      alt: "AWS for Startup"
                    },
                    {
                      src: "https://tokyosuteam.metro.tokyo.lg.jp/en/cms/wp-content/uploads/1996/10/024-179.jpg",
                      alt: "Start2"
                    },
                    {
                      src: "https://upload.wikimedia.org/wikipedia/commons/0/02/German_Accelerator_Logo.png",
                      alt: "German Accelerator"
                    },
                    {
                      src: "https://hyderabad.tie.org/wp-content/uploads/2025/02/TiE-Logo-Black.png",
                      alt: "TiE"
                    },
                    {
                      src: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTjailEBhsb5i8VHPzdulQcAkPvi4QgkW_8W_YdO_GZtT0DqhyY0W04T3FNERQ_NHW9_n0&usqp=CAU",
                      alt: "alpha"
                    }
                  ],
                  // Duplicate set for seamless looping
                  ...[
                    {
                      src: "https://remoters.net/wp-content/uploads/2020/06/draper-startup-house.png",
                      alt: "Draper"
                    },
                    {
                      src: "https://upload.wikimedia.org/wikipedia/commons/4/40/T-Hub_Logo-PNG.png",
                      alt: "T-Hub"
                    },
                    {
                      src: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSHpS7l6XHJgFCx3-FWabYpvaD4eSbGoIpVRSVsOgnCPue71d2UYOLNqxPdJ_gdijKzgw&usqp=CAU",
                      alt: "AWS for Startup"
                    },
                    {
                      src: "https://tokyosuteam.metro.tokyo.lg.jp/en/cms/wp-content/uploads/1996/10/024-179.jpg",
                      alt: "Start2"
                    },
                    {
                      src: "https://upload.wikimedia.org/wikipedia/commons/0/02/German_Accelerator_Logo.png",
                      alt: "German Accelerator"
                    },
                    {
                      src: "https://hyderabad.tie.org/wp-content/uploads/2025/02/TiE-Logo-Black.png",
                      alt: "TiE"
                    },
                    {
                      src: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTjailEBhsb5i8VHPzdulQcAkPvi4QgkW_8W_YdO_GZtT0DqhyY0W04T3FNERQ_NHW9_n0&usqp=CAU",
                      alt: "alpha"
                    }
                  ]
                ].map((partner, index) => (
                  <div 
                    key={index}
                    className="flex-shrink-0 h-16 w-32 sm:h-20 sm:w-40 bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-300 mx-4 flex items-center justify-center p-2"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                  >
                    <img
                      src={partner.src}
                      alt={partner.alt}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ))}
              </motion.div>
            </div>
          </motion.div>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="text-sm font-semibold text-blue-600">FAQ</p>
          <h2 className="mt-2 text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-gray-900">
            Frequently Asked Questions
          </h2>
          <p className="mt-3 sm:mt-4 text-sm sm:text-base md:text-lg text-gray-600">
            Common questions about our service and how it works
          </p>
        </motion.div>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mx-auto mt-8 sm:mt-12 md:mt-16 max-w-3xl"
        >
          <div className="divide-y divide-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
            {faqs.map((faq, index) => (
              <motion.div 
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 + 0.3 }}
                className="group"
              >
                <button
                  onClick={() => toggleFaq(index)}
                  className="flex w-full items-start justify-between px-4 py-4 sm:px-6 sm:py-5 text-left hover:bg-gray-50 focus:outline-none transition-colors duration-200"
                  aria-expanded={openIndex === index}
                >
                  <span className="text-sm sm:text-base font-medium text-gray-900">{faq.question}</span>
                  <span className="ml-6 flex h-7 items-center">
                    <motion.div
                      animate={{ rotate: openIndex === index ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDown className="h-5 w-5 text-gray-500" />
                    </motion.div>
                  </span>
                </button>
                <AnimatePresence>
                  {openIndex === index && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 sm:px-6 sm:pb-5">
                        <p className="text-xs sm:text-sm text-gray-600">{faq.answer}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default FAQ;
