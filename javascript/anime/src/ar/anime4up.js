const mangayomiSources = [{
  "name": "Anime4Up",
  "lang": "ar",
  "baseUrl": "https://w1.anime4up.rest",
  "apiUrl": "",
  "iconUrl": "https://w1.anime4up.rest/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.3",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "anime/src/ar/anime4up.js"
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
  // Selector matches: div.anime-list-content div.anime-card-poster > div.hover
  parseAnimeCards(doc) {
    const list = [];
    const cards = doc.select("div.anime-card-poster div.hover");
    for (const card of cards) {
      const a = card.selectFirst("a");
      const link = a?.attr("href") || "";
      const img = card.selectFirst("img");
      const imageUrl = img?.attr("src") || "";
      const title = img?.attr("alt") || a?.text?.trim() || "";
      if (link) {
        list.push({ name: title, imageUrl: imageUrl, link: link });
      }
    }
    return list;
  }

  async getPopular(page) {
    const url = `${this.baseUrl}/anime-list-3/page/${page}/`;
    const doc = await this.request(url);
    const list = this.parseAnimeCards(doc);
    const hasNextPage = !!doc.selectFirst("a.next");
    return { list, hasNextPage };
  }

  async getLatestUpdates(page) {
    const url = `${this.baseUrl}/recently-added/page/${page}/`;
    const doc = await this.request(url);
    const list = this.parseAnimeCards(doc);
    const hasNextPage = !!doc.selectFirst("a.next");
    return { list, hasNextPage };
  }

  async search(query, page, filters) {
    const url = `${this.baseUrl}/?s=${encodeURIComponent(query)}&page=${page}`;
    const doc = await this.request(url);
    const list = this.parseAnimeCards(doc);
    const hasNextPage = !!doc.selectFirst("a.next");
    return { list, hasNextPage };
  }

  async getDetail(url) {
    const doc = await this.request(url);

    // Title
    const title = doc.selectFirst("h1, h2")?.text || "";

    // Cover image — confirmed selector from Aniyomi extension: img.thumbnail
    const imageUrl = doc.selectFirst("img.thumbnail")?.attr("src") || "";

    // Description — confirmed selector: p.anime-story
    const description = doc.selectFirst("p.anime-story")?.text || "";

    // Genre
    const genreEls = doc.select(".anime-genres a, .genres a, div[class*='genre'] a");
    const genre = genreEls.map((el) => el.text.trim()).filter(Boolean);

    // Status
    const statusText = doc.selectFirst(".anime-info .status, .anime-status, span.status")?.text || "";
    const status = this.parseStatus(statusText);

    // Episodes
    // Confirmed selector from Aniyomi extension:
    // "div.ehover6 > div.episodes-card-title > h3 > a, ul.all-episodes-list li > a"
    const episodes = [];
    const seen = new Set();

    const epSelectors = [
      "div.ehover6 > div.episodes-card-title > h3 > a",
      "ul.all-episodes-list li > a",
      "#episodesList a[href*='/episode/']"
    ];

    for (const sel of epSelectors) {
      const epLinks = doc.select(sel);
      for (const ep of epLinks) {
        const epLink = ep.attr("href") || "";
        if (!epLink || seen.has(epLink)) continue;
        if (!epLink.includes("/episode/")) continue;
        seen.add(epLink);
        const epText = ep.text.trim();
        const epNumMatch = epText.match(/(\d+(\.\d+)?)/);
        const num = epNumMatch ? parseFloat(epNumMatch[1]) : episodes.length + 1;
        episodes.push({ name: `\u0627\u0644\u062d\u0644\u0642\u0629 ${num}`, url: epLink, num: num, scanlator: "" });
      }
      if (episodes.length > 0) break;
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

    // Find all server iframes/links
    const serverLinks = doc.select("ul.list-server-items li, .server-list li, li.server-item");

    for (const server of serverLinks) {
      const dataId = server.attr("data-id") || server.attr("data-embed") || "";
      const serverName = server.text.trim() || "Server";
      if (dataId) {
        videos.push({ url: dataId, quality: serverName, originalUrl: dataId });
      }
    }

    // Fallback: look for direct iframes
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
