// Arabic Anime Sources - Multi-site extension v0.0.1
// Includes: WitAnime

const mangayomiSources = [{
  "name": "anime_ar",
  "lang": "ar",
  "baseUrl": "https://witanime.you",
  "apiUrl": "",
  "iconUrl": "https://witanime.you/wp-content/uploads/2022/01/WITLOGO.png",
  "typeSource": "single",
  "itemType": 1,
  "isMFn": false,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "anime/src/anime_ar.js"
}];

class DefaultExtension extends MProvider {
  get baseUrl() {
    return this.source.baseUrl;
  }

  headers() {
    return { "Referer": this.baseUrl };
  }

  async request(url) {
    const res = await new Client().get(url, this.headers());
    return new Document(res.body);
  }

  parseAnimeCards(doc) {
    const list = [];
    const cards = doc.select("div.col-md-6.col-lg-2_4 a");
    
    for (const card of cards) {
      const link = card.attr("href");
      if (!link || link === "#") continue;
      
      const img = card.selectFirst("img");
      const title = card.selectFirst("div.ImgOverlay1, div.anime-card-title");
      
      if (link && img) {
        const name = title?.text().trim() || img.attr("alt")?.trim() || "";
        const imageUrl = img.attr("src") || img.attr("data-src") || "";
        
        if (name && link.includes("/anime/")) {
          list.push({ name, link, imageUrl });
        }
      }
    }
    
    return list;
  }

  async getPopular(page) {
    const url = `${this.baseUrl}/page/${page}`;
    const doc = await this.request(url);
    const list = this.parseAnimeCards(doc);
    const hasNextPage = doc.selectFirst("a.next.page-numbers, a[rel='next']") !== null;
    
    return { list, hasNextPage };
  }

  async getLatestUpdates(page) {
    const url = `${this.baseUrl}/episode/page/${page}`;
    const doc = await this.request(url);
    
    const list = [];
    const episodes = doc.select("div.col-md-3 a[href*='/episode/']");
    
    for (const ep of episodes) {
      const link = ep.attr("href");
      if (!link) continue;
      
      const img = ep.selectFirst("img");
      const epTitle = ep.selectFirst("div.ImgOverlay1, div.episode-title");
      
      const name = epTitle?.text().trim() || img?.attr("alt")?.trim() || "";
      const imageUrl = img?.attr("src") || img?.attr("data-src") || "";
      
      if (name && link) {
        list.push({ name, link, imageUrl });
      }
    }
    
    const hasNextPage = doc.selectFirst("a.next.page-numbers, a[rel='next']") !== null;
    return { list, hasNextPage };
  }

  async search(query, page, filters) {
    const url = `${this.baseUrl}/?s=${encodeURIComponent(query)}&page=${page}`;
    const doc = await this.request(url);
    const list = this.parseAnimeCards(doc);
    const hasNextPage = doc.selectFirst("a.next.page-numbers, a[rel='next']") !== null;
    
    return { list, hasNextPage };
  }

  parseStatus(statusText) {
    if (!statusText) return 0;
    const status = statusText.trim();
    
    if (status.includes("يعرض") || status.includes("مستمر")) return 0; // Ongoing
    if (status.includes("مكتمل") || status.includes("منتهي")) return 1; // Completed
    if (status.includes("متوقف")) return 2; // Hiatus
    if (status.includes("ملغي")) return 3; // Canceled
    
    return 5; // Unknown
  }

  async getDetail(url) {
    const doc = await this.request(url);
    
    const title = doc.selectFirst("h1, h1.anime-details-title")?.text().trim() || "";
    const img = doc.selectFirst("img.anime-details-img, div.RightBox img, div.anime-image img");
    const imageUrl = img ? (img.attr("src") || img.attr("data-src") || "") : "";
    
    const description = doc.selectFirst("div.anime-details-description, p.story, div.story")?.text().trim() || "";
    
    // Parse genres
    const genre = [];
    const genreLinks = doc.select("a[href*='/anime-genre/']");
    for (const g of genreLinks) {
      const genreName = g.text().trim();
      if (genreName) genre.push(genreName);
    }
    
    // Parse status
    const statusEl = doc.selectFirst("a[href*='/anime-status/']");
    const status = this.parseStatus(statusEl?.text() || "");
    
    // Parse episodes
    const episodes = [];
    const epLinks = doc.select("div.Episodes--Mainbody a, div.DivEpisodesList a[href*='/episode/']");
    
    for (const epLink of epLinks) {
      const epUrl = epLink.attr("href");
      if (!epUrl || epUrl === "#") continue;
      
      const epName = epLink.text().trim() || epLink.selectFirst("h3, span")?.text().trim() || "";
      
      if (epName && epUrl) {
        episodes.push({
          name: epName,
          url: epUrl
        });
      }
    }
    
    return {
      name: title,
      imageUrl,
      description,
      genre,
      status,
      episodes: episodes.reverse() // Reverse to get episode 1 first
    };
  }

  async getVideoList(url) {
    const doc = await this.request(url);
    const videos = [];
    
    // Get streaming servers
    const servers = doc.select("ul#episode-servers a, div.server-list a");
    
    for (const server of servers) {
      const serverUrl = server.attr("href");
      const quality = server.text().trim();
      
      if (serverUrl && serverUrl !== "#" && serverUrl.startsWith("http")) {
        videos.push({
          url: serverUrl,
          originalUrl: serverUrl,
          quality: quality || "Default"
        });
      }
    }
    
    // If no servers found via links, try data attributes
    if (videos.length === 0) {
      const serverItems = doc.select("li[data-url], a[data-url], button[data-url]");
      for (const item of serverItems) {
        const serverUrl = item.attr("data-url");
        const quality = item.text().trim();
        
        if (serverUrl && serverUrl.startsWith("http")) {
          videos.push({
            url: serverUrl,
            originalUrl: serverUrl,
            quality: quality || "Default"
          });
        }
      }
    }
    
    return videos;
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [];
  }
