export default {
  async fetch(request, env) {
    try {
      // Parse query parameters
      const { searchParams } = new URL(request.url);
      const query = searchParams.get("q"); // Search query (e.g., ?q=TH03279J078)
      const searchType = searchParams.get("searchType"); // Optional: image or undefined (web)
      const targetUrl = searchParams.get("url"); // Fallback for other URLs
      const entryId = parseInt(searchParams.get("entryId") || "1"); // EntryID for DataFrame-like output

      // Validate input
      if (!query && !targetUrl) {
        return new Response("Missing 'q' or 'url' query parameter. Example: ?q=test or ?url=https://example.com", {
          status: 400,
          headers: { "Content-Type": "text/plain" },
        });
      }

      // Log for debugging
      console.log(`Processing: ${query ? `search query ${query} (${searchType || "web"})` : `URL ${targetUrl}`}`);

      // Check KV cache
      const cacheKey = query ? `search:${query}:${searchType || "web"}:${entryId}` : `cache:${targetUrl}`;
      const cachedResponse = await env.BROWSER_KV_DEMO.get(cacheKey);
      if (cachedResponse) {
        console.log(`Serving from cache: ${cacheKey}`);
        return new Response(cachedResponse, {
          headers: {
            "Content-Type": query ? "application/json; charset=utf-8" : "text/html; charset=utf-8",
            "X-Robots-Tag": "noindex",
            "Cache-Control": "no-cache",
          },
        });
      }

      let content, contentType;
      if (query) {
        // Use Google Custom Search JSON API
        const searchEngineId = "400138774a1b94845"; // From your JSON response
        if (!env.GOOGLE_API_KEY) {
          
          return new Response("Google API key not configured", {
            status: 500,
            headers: { "Content-Type": "text/plain" },
          });
        }

        let apiUrl = `https://www.googleapis.com/customsearch/v1?key=${env.GOOGLE_API_KEY}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`;
        if (searchType === "image") {
          apiUrl += "&searchType=image";
        }

        console.log(`Fetching API: ${apiUrl}`);
        const response = await fetch(apiUrl, {
          signal: AbortSignal.timeout(5000),
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.log(`API failed: ${response.status} ${response.statusText} - ${errorText}`);
          return new Response(`Failed to fetch search results: ${response.statusText} - ${errorText}`, {
            status: response.status,
            headers: { "Content-Type": "text/plain" },
          });
        }

        // Parse JSON response
        const json = await response.json();
        const items = json.items || [];

        // Process results similar to Python code
        const results = items.map((item, index) => ({
          EntryID: entryId,
          ImageUrl: item.link || "No image URL",
          ImageDesc: item.snippet || item.htmlSnippet || "No description",
          ImageSource: item.image?.contextLink || "No source",
          ImageUrlThumbnail: item.image?.thumbnailLink || "No thumbnail URL",
        }));

        // Limit to 5 results (mimicking Python's min_length[:5])
        const limitedResults = results.slice(0, 5);

        content = JSON.stringify(limitedResults, null, 2);
        contentType = "application/json; charset=utf-8";
      } else {
        // Fallback to URL fetching
        let validUrl;
        try {
          validUrl = new URL(targetUrl);
          if (!validUrl.protocol.startsWith("https")) {
            return new Response("Only HTTPS URLs supported", {
              status: 400,
              headers: { "Content-Type": "text/plain" },
            });
          }
        } catch (e) {
          return new Response("Invalid URL", {
            status: 400,
            headers: { "Content-Type": "text/plain" },
          });
        }

        const response = await fetch(targetUrl, {
          signal: AbortSignal.timeout(5000),
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "DNT": "1",
            "Upgrade-Insecure-Requests": "1",
          },
          redirect: "manual",
        });

        if (response.status >= 300 && response.status < 400) {
          const redirectUrl = response.headers.get("Location");
          console.log(`Redirected to: ${redirectUrl}`);
          if (redirectUrl.includes("google.com/sorry/index")) {
            return new Response("Google detected automated request. Try ?q= for search or a different URL.", {
              status: 403,
              headers: { "Content-Type": "text/plain" },
            });
          }
          return new Response(`Redirected to ${redirectUrl}. Update the URL parameter.`, {
            status: 302,
            headers: { "Content-Type": "text/plain" },
          });
        }

        if (!response.ok) {
          console.log(`Fetch failed: ${response.status} ${response.statusText}`);
          return new Response(`Failed to fetch ${targetUrl}: ${response.statusText}`, {
            status: response.status,
            headers: { "Content-Type": "text/plain" },
          });
        }

        content = await response.text();
        if (targetUrl.includes("google.com/search")) {
          content = content
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
            .replace(/<meta[^>]*http-equiv=["']refresh["'][^>]*>/gi, "")
            .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, "");
          console.log("Stripped JavaScript, meta refreshes, and forms");
        }
        contentType = response.headers.get("Content-Type") || "text/html; charset=utf-8";
      }

      // Cache in KV
      try {
        await env.BROWSER_KV_DEMO.put(cacheKey, content, { expirationTtl: 86400 });
        console.log(`Cached ${cacheKey} in KV`);
      } catch (kvError) {
        console.log(`KV error: ${kvError.message}`);
      }

      return new Response(content, {
        headers: {
          "Content-Type": contentType,
          "X-Robots-Tag": "noindex",
          "Cache-Control": "no-cache",
        },
      });
    } catch (error) {
      console.log(`Error: ${error.message}`);
      return new Response(`Error: ${error.message}`, {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      });
    }
  },
};