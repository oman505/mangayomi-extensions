const mangayomiSources = [{
  "name": "Anime4Up",
  "lang": "ar",
  "baseUrl": "https://w1.anime4up.rest",
  "apiUrl": "",
  "iconUrl": "https://w1.anime4up.rest/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.4",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "javascript/anime/src/ar/anime4up.js"
}];

class DefaultExtension extends MProvider {
  get baseUrl() {
    return this.source.baseUrl;
  }

  async request(url) {
    const res = await new Client().get(url, { "Referer": this.baseUrl });
    return new Document(res.body);
  }

  // Parse anime cards from listing pages
  // Works for: /%d9%82%d8%a7%d8%a6%d9%85%d8%a9-%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a/ and /episode/
  parseAnimeCards(doc) {
    const list = [];
    // Try standard anime list card structure first
    let cards = doc.select("div.anime-card-container, div.anime-card-poster");
    if (cards.length === 0) {
      // Fallback: any article or div with a child link + img
      cards = doc.select("div.col-lg-2, div.col-md-3, div.col-sm-4");
    }
    for (const card of cards) {
      const a = card.selectFirst("a");
      const link = a?.attr("href") || "";
      const img = card.selectFirst("img");
      // Use getSrc to handle lazy-loaded images (data-src, data-lazy-src, etc.)
      const imageUrl = img?.getSrc || img?.attr("src") || img?.attr("data-src") || img?.attr("data-lazy-src") || "";
      const title = img?.attr("alt") || a?.text?.trim() || card.selectFirst("h3, h2, .title")?.text?.trim() || "";
      if (link && link.includes("/anime/")) {
        list.push({ name: title, imageUrl: imageUrl, link: link });
      }
    }
    return list;
  }

  async getPopular(page) {
    // Use the confirmed working anime list URL
    const encodedPath = encodeURIComponent("\u0642\u0627\u0626\u0645\u0629-\u0627\u0644\u0627\u0646\u0645\u064a");
    const url = `${this.baseUrl}/${encodedPath}/page/${page}/`;
    const doc = await this.request(url);
    const list = this.parseAnimeCards(doc);
    const hasNextPage = !!doc.selectFirst("a.next, a[rel='next']");
    return { list, hasNextPage };
  }

  async getLatestUpdates(page) {
    // Latest episodes archive
    const url = `${this.baseUrl}/episode/page/${page}/`;
    const doc = await this.request(url);
    const list = [];
    // Episode cards link to /episode/ paths; get unique anime links
    const seen = new Set();
    const cards = doc.select("div.anime-card-container, div.anime-card-poster, div.col-lg-2, div.col-md-3");
    for (const card of cards) {
      const a = card.selectFirst("a");
      const link = a?.attr("href") || "";
      if (!link || seen.has(link)) continue;
      seen.add(link);
      const img = card.selectFirst("img");
      const imageUrl = img?.getSrc || img?.attr("src") || img?.attr("data-src") || img?.attr("data-lazy-src") || "";
      const title = img?.attr("alt") || a?.text?.trim() || card.selectFirst("h3, h2")?.text?.trim() || "";
      if (link && title) {
        list.push({ name: title, imageUrl: imageUrl, link: link });
      }
    }
    const hasNextPage = !!doc.selectFirst("a.next, a[rel='next']");
    return { list, hasNextPage };
  }

  async search(query, page, filters) {
    const url = `${this.baseUrl}/?s=${encodeURIComponent(query)}&page=${page}`;
    const doc = await this.request(url);
    const list = this.parseAnimeCards(doc);
    const hasNextPage = !!doc.selectFirst("a.next, a[rel='next']");
    return { list, hasNextPage };
  }

  async getDetail(url) {
    const doc = await this.request(url);

    // Title
    const title = doc.selectFirst("h1")?.text?.trim() || doc.selectFirst("h2")?.text?.trim() || "";

    // Cover image - try multiple selectors, use getSrc for lazy loading
    let imageUrl = "";
    const imgSelectors = ["img.thumbnail", "div.anime-thumbnail img", ".anime-details img", ".anime-cover img", "img[alt]" ];
    for (const sel of imgSelectors) {
      const img = doc.selectFirst(sel);
      if (img) {
        imageUrl = img.getSrc || img.attr("src") || img.attr("data-src") || img.attr("data-lazy-src") || "";
        if (imageUrl) break;
      }
    }

    // Description
    const description = doc.selectFirst("p.anime-story, div.anime-story, .story, p.story")?.text?.trim() || "";

    // Genre
    const genreEls = doc.select(".anime-genres a, .genres a, div[class*='genre'] a");
    const genre = genreEls.map((el) => el.text.trim()).filter(Boolean);

    // Status
    const statusText = doc.selectFirst(".anime-info .status, span.status, .anime-status")?.text?.trim() || "";
    const status = this.parseStatus(statusText);

    // Episodes from #episodesList
    const episodes = [];
    const seen = new Set();
    const epLinks = doc.select("#episodesList a[href]");
    for (const ep of epLinks) {
      const epLink = ep.attr("href") || "";
      if (!epLink || seen.has(epLink)) continue;
      seen.add(epLink);
      const epText = ep.text?.trim() || ep.selectFirst("h3, span")?.text?.trim() || "";
      const epNumMatch = epText.match(/(\d+(\.\d+)?)/);
      const num = epNumMatch ? parseFloat(epNumMatch[1]) : episodes.length + 1;
      episodes.push({
        name: `\u0627\u0644\u062d\u0644\u0642\u0629 ${num}`,
        url: epLink,
        num: num,
        scanlator: ""
      });
    }

    return { name: title, imageUrl, description, genre, status, episodes };
  }

  parseStatus(text) {
    if (!text) return 0;
    if (text.includes("\u0645\u0643\u062a\u0645\u0644") || text.toLowerCase().includes("completed")) return 1;
    if (text.includes("\u064a\u0639\u0631\u0636") || text.toLowerCase().includes("ongoing")) return 2;
    return 0;
  }

  async getVideoList(url) {
    const doc = await this.request(url);
    const videos = [];

    // Find server list items with data-id attribute
    const serverLinks = doc.select("ul.list-server-items li, .server-list li, li.server-item, li[data-id]");
    for (const server of serverLinks) {
      const dataId = server.attr("data-id") || server.attr("data-embed") || "";
      const serverName = server.selectFirst("a, span")?.text?.trim() || server.text?.trim() || "Server";
      if (dataId) {
        videos.push({ url: dataId, quality: serverName, originalUrl: dataId });
      }
    }

    // Fallback: direct iframes
    if (videos.length === 0) {
      const iframes = doc.select("iframe[src]");
      for (const iframe of iframes) {
        const src = iframe.attr("src") || "";
        if (src) {
          videos.push({ url: src, quality: "Default", originalUrl: src });
        }
      }
    }

    return this.sortVideos(videos);
  }

  sortVideos(videos) {
    const preferences = new SharedPreferences();
    const preferredQuality = preferences.get("preferred_quality") || "1080";
    videos.sort((a, b) => {
      const aMatch = a.quality.includes(preferredQuality) ? 1 : 0;
      const bMatch = b.quality.includes(preferredQuality) ? 1 : 0;
      return bMatch - aMatch;
    });
    return videos;
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [
      {
        key: "preferred_quality",
        listPreference: {
          title: "\u062c\u0648\u062f\u0629 \u0627\u0644\u0641\u064a\u062f\u064a\u0648 \u0627\u0644\u0645\u0641\u0636\u0644\u0629",
          summary: "",
          valueIndex: 0,
          entries: ["FHD 1080p", "HD 720p", "SD 480p"],
          entryValues: ["1080", "720", "480"]
        }
      }
    ];
  }
}
