const mangayomiSources = [{
  "name": "Anime4Up",
  "lang": "ar",
  "baseUrl": "https://w1.anime4up.rest",
  "apiUrl": "",
  "iconUrl": "https://w1.anime4up.rest/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "anime/src/ar/anime4up.js"
}];

class DefaultExtension extends MProvider {
  get baseUrl() {
    return this.source.baseUrl;
  }

  async request(url, headers = {}) {
    const res = await new Client().get(url, headers);
    return new Document(res.body);
  }

  parseAnimeCards(doc) {
    const list = [];
    const cards = doc.select("div.anime-card-container");
    for (const card of cards) {
      const a = card.selectFirst("a");
      if (!a) continue;
      const link = a.attr("href");
      const name = card.selectFirst("div.anime-card-title")?.text ||
                   card.selectFirst("h3")?.text ||
                   a.attr("title") || "";
      const img = card.selectFirst("img");
      const imageUrl = img?.attr("src") || img?.attr("data-src") || "";
      if (link && name) list.push({ name: name.trim(), link, imageUrl });
    }
    return list;
  }

  async getPopular(page) {
    const url = `${this.baseUrl}/anime-type/tv2/?page=${page}`;
    const doc = await this.request(url);
    const list = this.parseAnimeCards(doc);
    const nextPage = doc.selectFirst("a.next.page-numbers") !== null;
    return { list, hasNextPage: nextPage };
  }

  async getLatestUpdates(page) {
    const url = `${this.baseUrl}/home8/`;
    const doc = await this.request(url);
    const list = [];
    const cards = doc.select("div.anime-card-container");
    for (const card of cards) {
      const a = card.selectFirst("a");
      if (!a) continue;
      const link = a.attr("href");
      const name = card.selectFirst("div.anime-card-title")?.text ||
                   card.selectFirst("h3")?.text ||
                   a.attr("title") || "";
      const img = card.selectFirst("img");
      const imageUrl = img?.attr("src") || img?.attr("data-src") || "";
      if (link && name) list.push({ name: name.trim(), link, imageUrl });
    }
    return { list, hasNextPage: false };
  }

  async search(query, page, filters) {
    const url = `${this.baseUrl}/?s=${encodeURIComponent(query)}&page=${page}`;
    const doc = await this.request(url);
    const list = this.parseAnimeCards(doc);
    const nextPage = doc.selectFirst("a.next.page-numbers") !== null;
    return { list, hasNextPage: nextPage };
  }

  async getDetail(url) {
    const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url}`;
    const doc = await this.request(fullUrl);

    // Title
    const name = doc.selectFirst("h1.anime-details-title")?.text ||
                 doc.selectFirst("h1")?.text || "";

    // Cover image
    const imageUrl = doc.selectFirst("img.anime-thumbnail")?.attr("src") ||
                     doc.selectFirst("div.anime-poster img")?.attr("src") ||
                     doc.selectFirst(".series-image img")?.attr("src") ||
                     doc.selectFirst("img[alt]")?.attr("src") || "";

    // Description
    const description = doc.selectFirst("div.anime-story")?.text ||
                        doc.selectFirst("p.anime-story")?.text ||
                        doc.selectFirst(".story")?.text || "";

    // Genres
    const genreEls = doc.select("div.anime-genres a, .anime-genre a");
    const genre = genreEls.map(el => el.text.trim());

    // Status
    const statusText = doc.selectFirst(".anime-info .status")?.text ||
                       doc.selectFirst(".anime-status")?.text || "";
    const status = this.parseStatus(statusText);

    // Episodes - from the episodes grid on the detail page
    const episodes = [];
    const epCards = doc.select("div.ep-card-container, div.episodes-container a, div.DivEpisodesList a");
    for (const ep of epCards) {
      const epLink = ep.attr("href") || ep.selectFirst("a")?.attr("href") || "";
      if (!epLink) continue;
      const epNumText = ep.selectFirst(".episode-number, .EpisodeNumber, span")?.text ||
                        ep.text || "";
      const epNumMatch = epNumText.match(/(\d+(\.\d+)?)/);
      const num = epNumMatch ? parseFloat(epNumMatch[1]) : episodes.length + 1;
      const epName = `الحلقة ${num}`;
      episodes.push({ name: epName, url: epLink, num, scanlator: "مترجم" });
    }

    // Fallback: parse episode list from sidebar #ULEpisodesList
    if (episodes.length === 0) {
      const epLinks = doc.select("#ULEpisodesList a");
      for (const ep of epLinks) {
        const epLink = ep.attr("href") || "";
        if (!epLink) continue;
        const epText = ep.text.trim();
        const epNumMatch = epText.match(/(\d+(\.\d+)?)/);
        const num = epNumMatch ? parseFloat(epNumMatch[1]) : episodes.length + 1;
        episodes.push({ name: epText, url: epLink, num, scanlator: "مترجم" });
      }
    }

    return { name: name.trim(), imageUrl, description: description.trim(), genre, status, episodes };
  }

  parseStatus(text) {
    if (!text) return 5;
    const t = text.toLowerCase();
    if (t.includes("مستمر") || t.includes("ongoing") || t.includes("يعرض")) return 0;
    if (t.includes("مكتمل") || t.includes("completed") || t.includes("منتهي")) return 1;
    return 5;
  }

  async getVideoList(url) {
    const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url}`;
    const doc = await this.request(fullUrl);
    const videos = [];

    // Collect all download/stream links from the download table
    const rows = doc.select("table tr, .download-links tr");
    for (const row of rows) {
      const a = row.selectFirst("a");
      if (!a) continue;
      const href = a.attr("href") || "";
      if (!href || href === "#") continue;

      const serverCell = row.selectFirst("td:nth-child(2), .server-name");
      const qualityCell = row.selectFirst("td:nth-child(3), .quality");
      const server = serverCell?.text.trim() || "";
      const quality = qualityCell?.text.trim() || "";
      const qualityLabel = `${server} - ${quality}`;

      // Handle known streaming hosts with their extractors
      try {
        if (href.includes("mp4upload.com")) {
          const vids = await mp4UploadExtractor(href, qualityLabel);
          for (const v of vids) videos.push(v);
        } else if (href.includes("dood") || href.includes("d0od")) {
          const vids = await doodExtractor(href);
          for (const v of vids) videos.push({ ...v, quality: qualityLabel || v.quality });
        } else if (href.includes("voe.sx") || href.includes("voe.")) {
          const vids = await voeExtractor(href);
          for (const v of vids) videos.push({ ...v, quality: qualityLabel || v.quality });
        } else if (href.includes("ok.ru") || href.includes("okru")) {
          const vids = await okruExtractor(href);
          for (const v of vids) videos.push(v);
        } else if (href.includes("filemoon") || href.includes("moonplayer")) {
          const vids = await filemoonExtractor(href);
          for (const v of vids) videos.push(v);
        } else if (href.includes("streamwish") || href.includes("wish")) {
          const vids = await streamWishExtractor(href, qualityLabel);
          for (const v of vids) videos.push(v);
        } else if (href.includes("streamruby") || href.includes("dsvplay") || href.includes("megamax")) {
          // These are direct or semi-direct links — add as-is
          videos.push({ url: href, originalUrl: href, quality: qualityLabel, headers: { "Referer": this.baseUrl } });
        } else if (href.match(/\.(mp4|m3u8)(\?|$)/i)) {
          videos.push({ url: href, originalUrl: href, quality: qualityLabel, headers: { "Referer": this.baseUrl } });
        }
      } catch (e) {
        // silently skip failed extractors
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
        "key": "preferred_quality",
        "listPreference": {
          "title": "الجودة المفضلة",
          "summary": "",
          "valueIndex": 0,
          "entries": ["FHD 1080p", "HD 720p", "SD 480p"],
          "entryValues": ["1080", "720", "480"]
        }
      }
    ];
  }
}
