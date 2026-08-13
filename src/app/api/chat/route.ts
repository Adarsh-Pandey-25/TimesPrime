import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message } = body;

    if (!message) {
      return NextResponse.json(
        { error: "Message content is required" },
        { status: 400 }
      );
    }

    // Simulate 1-second AI processing delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const query = message.toLowerCase();
    let responseText = "I'm your TimesPrime AI News Assistant. How can I help you explore today's headlines?";

    if (query.includes("tech") || query.includes("technology") || query.includes("ai")) {
      responseText = "Tech headlines today are dominated by major breakthroughs in AI models, Next.js updates, and global semiconductor developments. Would you like me to highlight top tech stories for you?";
    } else if (query.includes("market") || query.includes("business") || query.includes("stock")) {
      responseText = "Global financial markets are showing positive momentum following tech sector earnings reports. Central banks are keeping key interest rates under close watch.";
    } else if (query.includes("sport") || query.includes("game")) {
      responseText = "In sports, exciting tournament finals and trade updates are making waves across football, basketball, and tennis matches worldwide!";
    } else if (query.includes("summary") || query.includes("explain")) {
      responseText = "I can summarize any article for you! Simply open an article card or paste its topic here, and I'll break down the key takeaways.";
    } else {
      responseText = `Thanks for asking about "${message}". As your news assistant, I continuously monitor global RSS feeds and breaking stories to deliver accurate, instant insights.`;
    }

    return NextResponse.json({
      reply: responseText,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to process chat request" },
      { status: 500 }
    );
  }
}
