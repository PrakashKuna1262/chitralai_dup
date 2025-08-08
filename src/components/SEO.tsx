import React from 'react';
import { Helmet } from 'react-helmet-async';

type SEOProps = {
  title?: string;
  description?: string;
  canonicalPath?: string;
  image?: string;
};

const SITE_NAME = 'chitralai';
const SITE_URL = 'https://www.chitralai.in';
const DEFAULT_DESCRIPTION =
  'chitralai helps event organizers and attendees easily upload, discover, and share photos using AI-powered face recognition and smart galleries.';
const DEFAULT_IMAGE = '/chitralai.jpeg';

export function SEO({ title, description, canonicalPath, image }: SEOProps) {
  const pageTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  const canonicalUrl = canonicalPath ? `${SITE_URL}${canonicalPath}` : SITE_URL;
  const imageUrl = image?.startsWith('http') ? image : `${SITE_URL}${image || DEFAULT_IMAGE}`;
  const metaDescription = description || DEFAULT_DESCRIPTION;

  return (
    <Helmet>
      <title>{pageTitle}</title>
      <meta name="description" content={metaDescription} />
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={imageUrl} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={imageUrl} />
    </Helmet>
  );
}

export default SEO;


