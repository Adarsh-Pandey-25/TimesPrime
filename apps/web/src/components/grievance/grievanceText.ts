import type { GrievanceLanguage } from "@timesprime/shared/config/grievances";

// The grievance form's and the status page's words, in English and Hindi (Panel 7 design §4): they
// follow the reader's language, as the rest of the site's own text does. The wording is for the
// owner's legal review (BL-008).

export const GRIEVANCE_TEXT = {
  en: {
    formTitle: "Send a grievance",
    formIntro: "Your grievance is acknowledged at once, with a ticket number. We decide on it within 15 days.",
    name: "Your name",
    email: "Your email, for our reply",
    aboutUrl: "The address of the story it is about (optional)",
    aboutUrlHint: "Copy it from your browser's address bar.",
    category: "What is it about?",
    body: "Your grievance",
    bodyHint: (max: number) => `What is wrong, and why. At most ${max.toLocaleString("en-IN")} characters.`,
    notice:
      "We keep your name, email and grievance to handle it, and count it in our monthly report of grievances. Only our Grievance Officer and Legal see your email.",
    send: "Send the grievance",
    sending: "Sending…",
    sentTitle: "Your grievance is received and acknowledged",
    sentTicket: "Your ticket",
    sentDue: (date: string) => `We will decide on it by ${date}, and tell you by email.`,
    sentKeep: "Keep the ticket: with your email, it shows your grievance's status.",
    statusLink: "Check its status",
    errors: {
      invalid: "Please check each field.",
      too_many: "Too many grievances from this connection. Please try again later, or email the Grievance Officer.",
      closed_today: "The form takes no more grievances today. Please email the Grievance Officer.",
      failed: "Your grievance could not be sent. Please try again, or email the Grievance Officer.",
    },
    statusTitle: "Your grievance's status",
    statusIntro: "Enter the ticket and the email you sent the grievance with.",
    ticket: "Ticket",
    yourEmail: "Your email",
    show: "Show the status",
    showing: "Looking…",
    notFound: "No grievance has this ticket and email. Check both, as you sent them.",
    statusErrors: {
      invalid: "Enter a ticket like G-2026-00042, and your email.",
      too_many: "Too many tries from this connection. Please try again in an hour.",
      failed: "The status could not be read. Please try again.",
    },
    open: "Open: we are looking into it.",
    received: (date: string) => `Received ${date}`,
    acknowledged: (date: string) => `acknowledged ${date}`,
    due: (date: string) => `The decision is due by ${date}.`,
    decided: (date: string, outcome: string) => `Decided ${date}: ${outcome}.`,
    reply: "Our reply",
    sendAnother: "Send a grievance",
  },
  hi: {
    formTitle: "शिकायत भेजें",
    formIntro: "आपकी शिकायत तुरंत स्वीकार की जाती है और आपको टिकट नंबर मिलता है। हम 15 दिनों के भीतर फ़ैसला करते हैं।",
    name: "आपका नाम",
    email: "आपका ईमेल, हमारे जवाब के लिए",
    aboutUrl: "जिस खबर के बारे में शिकायत है, उसका पता (वैकल्पिक)",
    aboutUrlHint: "इसे अपने ब्राउज़र की एड्रेस बार से कॉपी करें।",
    category: "शिकायत किस बारे में है?",
    body: "आपकी शिकायत",
    bodyHint: (max: number) => `क्या गलत है, और क्यों। अधिकतम ${max.toLocaleString("hi-IN")} अक्षर।`,
    notice:
      "शिकायत पर कार्रवाई के लिए हम आपका नाम, ईमेल और शिकायत रखते हैं, और इसे शिकायतों की मासिक रिपोर्ट में गिनते हैं। आपका ईमेल केवल हमारे शिकायत अधिकारी और लीगल टीम देखते हैं।",
    send: "शिकायत भेजें",
    sending: "भेजी जा रही है…",
    sentTitle: "आपकी शिकायत मिल गई है और स्वीकार कर ली गई है",
    sentTicket: "आपका टिकट",
    sentDue: (date: string) => `हम ${date} तक फ़ैसला करेंगे और आपको ईमेल से बताएंगे।`,
    sentKeep: "टिकट संभाल कर रखें: अपने ईमेल के साथ इससे आप शिकायत की स्थिति देख सकते हैं।",
    statusLink: "स्थिति देखें",
    errors: {
      invalid: "कृपया हर जानकारी जाँच लें।",
      too_many: "इस कनेक्शन से बहुत सारी शिकायतें आई हैं। कृपया बाद में कोशिश करें, या शिकायत अधिकारी को ईमेल करें।",
      closed_today: "आज फ़ॉर्म और शिकायतें नहीं ले रहा। कृपया शिकायत अधिकारी को ईमेल करें।",
      failed: "आपकी शिकायत नहीं भेजी जा सकी। कृपया फिर कोशिश करें, या शिकायत अधिकारी को ईमेल करें।",
    },
    statusTitle: "आपकी शिकायत की स्थिति",
    statusIntro: "टिकट और वह ईमेल डालें जिससे आपने शिकायत भेजी थी।",
    ticket: "टिकट",
    yourEmail: "आपका ईमेल",
    show: "स्थिति देखें",
    showing: "देखा जा रहा है…",
    notFound: "इस टिकट और ईमेल वाली कोई शिकायत नहीं मिली। दोनों वैसे ही भरें जैसे भेजे थे।",
    statusErrors: {
      invalid: "G-2026-00042 जैसा टिकट और अपना ईमेल डालें।",
      too_many: "इस कनेक्शन से बहुत बार कोशिश हुई है। कृपया एक घंटे बाद फिर कोशिश करें।",
      failed: "स्थिति नहीं पढ़ी जा सकी। कृपया फिर कोशिश करें।",
    },
    open: "खुली: हम इस पर काम कर रहे हैं।",
    received: (date: string) => `${date} को मिली`,
    acknowledged: (date: string) => `${date} को स्वीकार की गई`,
    due: (date: string) => `फ़ैसला ${date} तक होगा।`,
    decided: (date: string, outcome: string) => `${date} को फ़ैसला: ${outcome}।`,
    reply: "हमारा जवाब",
    sendAnother: "शिकायत भेजें",
  },
} as const;

/** A date in IST, in the reader's language: "5 Dec 2026, 3:05 pm" or its Hindi form. */
export function grievanceDate(iso: string, language: GrievanceLanguage): string {
  return new Date(iso).toLocaleString(language === "hi" ? "hi-IN" : "en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
