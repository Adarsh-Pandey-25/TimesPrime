export type Language = "en" | "hi";

export interface TranslationDictionary {
  liveFeed: string;
  edition: string;
  globalNewsHub: string;
  aiAssistant: string;
  currentFeed: string;
  topWorldStories: string;
  storiesAvailable: string;
  refresh: string;
  featuredCoverage: string;
  topStories: string;
  trendingHighlights: string;
  latestUpdates: string;
  readFullArticle: string;
  saveArticle: string;
  readArticle: string;
  categories: {
    general: string;
    india: string;
    world: string;
    tech: string;
    business: string;
    sports: string;
    entertainment: string;
    health: string;
    science: string;
  };
  footer: {
    about: string;
    verifiedSources: string;
    realtimeCaching: string;
    newsCategories: string;
    newsletterTitle: string;
    newsletterDesc: string;
    emailPlaceholder: string;
    subscribe: string;
    allRightsReserved: string;
  };
  articleView: {
    backToHeadlines: string;
    originalSource: string;
    specialReport: string;
    verifiedDigest: string;
    aiExecutiveSummary: string;
    visitPublisher: string;
    suggestedNews: string;
  };
}

export const TRANSLATIONS: Record<Language, TranslationDictionary> = {
  en: {
    liveFeed: "Live Feed",
    edition: "Edition: Global",
    globalNewsHub: "Global News Hub",
    aiAssistant: "AI News Assistant",
    currentFeed: "Current Feed",
    topWorldStories: "Top World Stories",
    storiesAvailable: "Stories Available",
    refresh: "Refresh",
    featuredCoverage: "Featured Coverage",
    topStories: "Top Stories",
    trendingHighlights: "Trending Highlights",
    latestUpdates: "Latest Updates",
    readFullArticle: "Read Full Article",
    saveArticle: "Save Article",
    readArticle: "Read Article →",
    categories: {
      general: "Top Stories",
      india: "India",
      world: "World",
      tech: "Technology",
      business: "Business",
      sports: "Sports",
      entertainment: "Entertainment",
      health: "Health",
      science: "Science",
    },
    footer: {
      about: "TimesPrime is your premier AI-powered global news aggregator. Delivering instant, accurate, and categorized headlines from verified publishers.",
      verifiedSources: "Verified Sources",
      realtimeCaching: "Real-time Caching",
      newsCategories: "News Categories",
      newsletterTitle: "Daily Digest Newsletter",
      newsletterDesc: "Get the top global stories delivered straight to your inbox every morning.",
      emailPlaceholder: "Enter your email address",
      subscribe: "Subscribe",
      allRightsReserved: "All rights reserved.",
    },
    articleView: {
      backToHeadlines: "Back to Headlines",
      originalSource: "Original Source",
      specialReport: "Special Report",
      verifiedDigest: "TimesPrime Verified Digest",
      aiExecutiveSummary: "AI Executive Summary",
      visitPublisher: "Visit Publisher Page",
      suggestedNews: "Recommended & Suggested News",
    },
  },
  hi: {
    liveFeed: "लाइव अपडेट",
    edition: "संस्करण: वैश्विक",
    globalNewsHub: "ग्लोबल न्यूज़ हब",
    aiAssistant: "एआई समाचार सहायक",
    currentFeed: "मुख्य समाचार",
    topWorldStories: "दुनिया की प्रमुख खबरें",
    storiesAvailable: "उपलब्ध समाचार",
    refresh: "रिफ्रेश करें",
    featuredCoverage: "मुख्य विशेष कवरेज",
    topStories: "प्रमुख खबरें",
    trendingHighlights: "ट्रेंडिंग हाइलाइट्स",
    latestUpdates: "ताजा अपडेट",
    readFullArticle: "पूरा समाचार पढ़ें",
    saveArticle: "सेव करें",
    readArticle: "समाचार पढ़ें →",
    categories: {
      general: "प्रमुख खबरें",
      india: "भारत",
      world: "विदेश",
      tech: "तकनीक",
      business: "व्यापार",
      sports: "खेल",
      entertainment: "मनोरंजन",
      health: "स्वास्थ्य",
      science: "विज्ञान",
    },
    footer: {
      about: "टाइम्सप्राइम आपका प्रमुख एआई-संचालित वैश्विक समाचार एग्रीगेटर है। सत्यापित प्रकाशकों से त्वरित, सटीक और वर्गीकृत सुर्खियां प्रदान करता है।",
      verifiedSources: "सत्यापित स्रोत",
      realtimeCaching: "रियल-टाइम कैशिंग",
      newsCategories: "समाचार श्रेणियां",
      newsletterTitle: "दैनिक समाचार पत्रिका",
      newsletterDesc: "हर सुबह प्रमुख वैश्विक समाचार सीधे अपने इनबॉक्स में प्राप्त करें।",
      emailPlaceholder: "अपना ईमेल पता दर्ज करें",
      subscribe: "सदस्यता लें",
      allRightsReserved: "सर्वाधिकार सुरक्षित।",
    },
    articleView: {
      backToHeadlines: "मुख्य पृष्ठ पर लौटें",
      originalSource: "मूल स्रोत",
      specialReport: "विशेष रिपोर्ट",
      verifiedDigest: "टाइम्सप्राइम सत्यापित सारांश",
      aiExecutiveSummary: "एआई कार्यकारी सारांश",
      visitPublisher: "मूल प्रकाशक पृष्ठ देखें",
      suggestedNews: "संबंधित एवं सुझाई गई खबरें",
    },
  },
};

export function translateHeadline(text: string, lang: Language): string {
  if (!text) return text;
  return text;
}
