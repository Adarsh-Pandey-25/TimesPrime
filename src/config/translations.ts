export type Language = "en" | "hi";

export interface TranslationDictionary {
  currentFeed: string;
  topWorldStories: string;
  featuredCoverage: string;
  topStories: string;
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
    allRightsReserved: string;
    followUs: string;
    newsHeading: string;
    moreNewsHeading: string;
    savedArticles: string;
    companyHeading: string;
    aboutUs: string;
    contactUs: string;
    advertiseWithUs: string;
    privacyPolicy: string;
    termsOfUse: string;
    backToTop: string;
  };
  articleView: {
    aiExecutiveSummary: string;
  };
}

export const TRANSLATIONS: Record<Language, TranslationDictionary> = {
  en: {
    currentFeed: "Current Feed",
    topWorldStories: "Top World Stories",
    featuredCoverage: "Featured Coverage",
    topStories: "Top Stories",
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
      allRightsReserved: "All rights reserved.",
      followUs: "Follow Us:",
      newsHeading: "News",
      moreNewsHeading: "More News",
      savedArticles: "Saved Articles",
      companyHeading: "Company",
      aboutUs: "About Us",
      contactUs: "Contact Us",
      advertiseWithUs: "Advertise With Us",
      privacyPolicy: "Privacy Policy",
      termsOfUse: "Terms of Use",
      backToTop: "Back to top",
    },
    articleView: {
      aiExecutiveSummary: "AI Executive Summary",
    },
  },
  hi: {
    currentFeed: "मुख्य समाचार",
    topWorldStories: "दुनिया की प्रमुख खबरें",
    featuredCoverage: "मुख्य विशेष कवरेज",
    topStories: "प्रमुख खबरें",
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
      allRightsReserved: "सर्वाधिकार सुरक्षित।",
      followUs: "हमें फॉलो करें:",
      newsHeading: "समाचार",
      moreNewsHeading: "अधिक समाचार",
      savedArticles: "सेव किए गए समाचार",
      companyHeading: "कंपनी",
      aboutUs: "हमारे बारे में",
      contactUs: "संपर्क करें",
      advertiseWithUs: "विज्ञापन दें",
      privacyPolicy: "गोपनीयता नीति",
      termsOfUse: "उपयोग की शर्तें",
      backToTop: "ऊपर जाएं",
    },
    articleView: {
      aiExecutiveSummary: "एआई कार्यकारी सारांश",
    },
  },
};

export function translateHeadline(text: string, lang: Language): string {
  if (!text) return text;
  return text;
}
