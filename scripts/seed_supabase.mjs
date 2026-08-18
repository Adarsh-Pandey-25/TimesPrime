const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apiKey = process.env.NEWSDATA_API_KEY;

if (!supabaseUrl || !serviceRoleKey || !apiKey) {
  console.error(
    "Missing required env vars. Run with: node --env-file=.env.local scripts/seed_supabase.mjs\n" +
      "Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEWSDATA_API_KEY"
  );
  process.exit(1);
}

const CATEGORIES = ["top", "technology", "business", "sports", "entertainment", "health", "science"];

async function seedSupabaseWithServiceRole() {
  console.log("🚀 Starting Ingestion into Supabase with Service Role Admin Key...");

  let totalArticlesSaved = 0;

  for (const cat of CATEGORIES) {
    console.log(`📡 Fetching NewsData.io API for category: [${cat}]...`);
    try {
      const targetUrl = `https://newsdata.io/api/1/latest?apikey=${apiKey}&category=${cat}&language=en`;
      const response = await fetch(targetUrl);

      if (!response.ok) {
        console.error(`⚠️ NewsData API returned status ${response.status} for category ${cat}`);
        continue;
      }

      const data = await response.json();
      const rawResults = data.results || [];

      if (rawResults.length === 0) {
        console.log(`ℹ️ No articles found for category ${cat}`);
        continue;
      }

      const rowsToInsert = rawResults.map((art) => ({
        article_id: String(art.article_id || art.link),
        title: String(art.title || "Untitled Article"),
        link: String(art.link || "#"),
        description: String(art.description || ""),
        content: String(art.content || art.description || ""),
        pub_date: String(art.pubDate || new Date().toISOString()),
        image_url: art.image_url || art.source_icon || null,
        source_id: String(art.source_id || ""),
        source_name: String(art.source_name || "News Source"),
        category: art.category || [cat],
        country: art.country || ["us"],
        language: String(art.language || "english"),
        created_at: new Date().toISOString(),
      }));

      // Direct REST Upsert to Supabase with Service Role Key
      const supabaseRestEndpoint = `${supabaseUrl}/rest/v1/articles`;
      const supabaseRes = await fetch(supabaseRestEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Prefer": "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(rowsToInsert),
      });

      if (!supabaseRes.ok) {
        const errText = await supabaseRes.text();
        console.error(`❌ Supabase REST Error for ${cat} (${supabaseRes.status}):`, errText);
      } else {
        const inserted = await supabaseRes.json();
        const count = Array.isArray(inserted) ? inserted.length : rowsToInsert.length;
        totalArticlesSaved += count;
        console.log(`✅ Saved ${count} live articles for [${cat}] into Supabase!`);
      }
    } catch (err) {
      console.error(`❌ Processing error for ${cat}:`, err.message);
    }
  }

  // 7-day auto-purge cleanup
  console.log("🧹 Running 7-day auto-purge cleanup in Supabase...");
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const purgeUrl = `${supabaseUrl}/rest/v1/articles?created_at=lt.${encodeURIComponent(sevenDaysAgo)}`;
    const purgeRes = await fetch(purgeUrl, {
      method: "DELETE",
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
    });

    if (purgeRes.ok) {
      console.log("🧹 7-day auto-purge completed successfully.");
    }
  } catch (e) {
    // Ignore purge error
  }

  console.log(`\n🎉 SEED COMPLETE! Total ${totalArticlesSaved} live news articles are now stored in Supabase!`);
}

seedSupabaseWithServiceRole();
