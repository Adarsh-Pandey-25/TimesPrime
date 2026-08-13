/**
 * Contextual Topic Image Selector Utility
 * Analyzes article titles, categories, and descriptions (in Hindi and English)
 * to return high-resolution, topic-relevant thumbnail images instead of generic placeholders.
 */

const TOPIC_IMAGE_MAP = [
  {
    keywords: [
      // Politics, Government, Law, India, State Affairs
      "बंगाल", "सरकार", "पुलिस", "चुनाव", "मदरसा", "मस्जिद", "कोर्ट", "नेता", "मंत्रालय", "प्रशासन", "संसद", "संविधान", "सुप्रीम कोर्ट", "हाईकोर्ट", "कमिशनर", "एसपी", "शुभेंदु", "भाजपा", "कांग्रेस", "आप", "केजरीवाल", "मोदी",
      "bengal", "government", "police", "election", "court", "minister", "parliament", "politics", "india", "modi", "state", "assembly", "governance", "judge", "bjp", "congress", "law"
    ],
    imageUrl: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=1200&auto=format&fit=crop&q=80", // Law / Court / Governance
  },
  {
    keywords: [
      // Tech, AI, Mobile, Cyber, Gadgets
      "एआई", "तकनीक", "स्मार्टफोन", "कंप्यूटर", "सॉफ्टवेयर", "ऐप", "साइबर", "डेटा", "एप्पल", "गूगल", "माइक्रोसॉफ्ट", "मोबाइल", "इंटरनेट",
      "ai", "tech", "technology", "apple", "iphone", "google", "software", "chip", "cyber", "data", "robot", "cloud", "app", "gadget"
    ],
    imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80", // High tech circuits
  },
  {
    keywords: [
      // Business, Stocks, Economy, Banking, Finance
      "व्यापार", "शेयर", "बाज़ार", "अर्थव्यवस्था", "बैंक", "निवेश", "वित्त", "रुपया", "डॉलर", "कम्पनी", "स्टॉक", "बिटकॉइन",
      "business", "stock", "market", "economy", "bank", "crypto", "bitcoin", "trade", "finance", "investor", "revenue", "dollar"
    ],
    imageUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&auto=format&fit=crop&q=80", // Finance / Stock Chart
  },
  {
    keywords: [
      // Sports, Cricket, Football, Tennis
      "खेल", "क्रिकेट", "मैच", "टीम", "खिलाड़ी", "टूर्नामेंट", "ओलंपिक", "जीत", "विश्व कप", "आईपीएल", "फुटबॉल",
      "sport", "sports", "cricket", "football", "match", "stadium", "cup", "champion", "league", "ipl", "messi", "ronaldo", "virat"
    ],
    imageUrl: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1200&auto=format&fit=crop&q=80", // Sports Stadium
  },
  {
    keywords: [
      // Entertainment, Cinema, Movies, Bollywood
      "फिल्म", "सिनेमा", "अभिनेता", "अभिनेत्री", "मनोरंजन", "संगीत", "गीत", "बॉलीवुड", "हॉलीवुड", "स्टार", "ट्रेलर",
      "movie", "film", "cinema", "actor", "actress", "entertainment", "music", "star", "trailer", "bollywood", "hollywood", "ott"
    ],
    imageUrl: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1200&auto=format&fit=crop&q=80", // Cinema Hall
  },
  {
    keywords: [
      // Health, Medical, Science
      "स्वास्थ्य", "अस्पताल", "डॉक्टर", "दवा", "बीमारी", "इलाज", "वैक्सीन", "कैंसर", "कोरोना", "वायरस",
      "health", "hospital", "doctor", "medicine", "disease", "cure", "virus", "medical", "vaccine", "treatment"
    ],
    imageUrl: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1200&auto=format&fit=crop&q=80", // Medical / Laboratory
  },
  {
    keywords: [
      // Space, Astronomy, Rocket, Science
      "अंतरिक्ष", "रॉकेट", "उपग्रह", "ग्रह", "वैज्ञानिक", "नासा", "इसरो", "विज्ञान", "खगोल",
      "space", "nasa", "isro", "rocket", "planet", "astronomy", "galaxy", "moon", "mars", "satellite", "physics"
    ],
    imageUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&auto=format&fit=crop&q=80", // Deep Space / Earth
  },
];

const GENERIC_NEWS_FALLBACK = "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200&auto=format&fit=crop&q=80";

/**
 * Returns a contextually relevant thumbnail image based on article title, category, and description.
 */
export function getTopicImageUrl(
  title?: string | null,
  category?: string | string[] | null,
  description?: string | null,
  existingUrl?: string | null
): string {
  // If existingUrl is valid and not the generic placeholder, use it
  if (existingUrl && typeof existingUrl === "string" && existingUrl.startsWith("http") && !existingUrl.includes("photo-1504711434969-e33886168f5c")) {
    return existingUrl;
  }

  const combinedText = `${title || ""} ${description || ""} ${Array.isArray(category) ? category.join(" ") : category || ""}`.toLowerCase();

  for (const topic of TOPIC_IMAGE_MAP) {
    for (const kw of topic.keywords) {
      if (combinedText.includes(kw.toLowerCase())) {
        return topic.imageUrl;
      }
    }
  }

  // General India / Global News default image (clean newspaper press badge, not generic business B3)
  return "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=1200&auto=format&fit=crop&q=80";
}
