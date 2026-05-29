const mangayomiSources = [{
  "name": "Anime4Up",
  "lang": "ar",
  "baseUrl": "https://w1.anime4up.rest",
  "apiUrl": "",
  "iconUrl": "https://w1.anime4up.rest/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.2",
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

  parseAnimeCards(doc) {
    const list = [];
    // Selector covers: div.anime-card-container or any li/div that wraps an <a> + <img>
    const cards = doc.select("div.anime-card-container, div.grid-archive-item");
    for (const card of cards) {
      const a = card.selectFirst("a");
      if (!a) continue;
      const link = a.attr("href");
      const img = card.selectFirst("img");
      // Use .getSrc which auto-resolves src / data-src / data-lazy-src
      const imageUrl = img?.getSrc ?? "";
      const name =
        card.selectFirst(".anime-card-title, h3, .title, .post-title")?.text ||
        a.attr("title") ||
        img?.attr("alt") ||
        "";
      if (link && name.trim()) list.push({ name: name.trim(), link, imageUrl });
    }
    // Fallback: if main selector returns nothing, try article / post elements
    if (list.length === 0) {
      const posts = doc.select("article, .post, .item");
      for (const post of posts) {
        const a = post.selectFirst("a");
        if (!a) continue;
        const link = a.attr("href") || "";
        if (!link.includes("/anime/")) continue;
        const img = post.selectFirst("img");
        const imageUrl = img?.getSrc ?? "";
        const name =
          post.selectFirst("h2, h3, .title, .post-title")?.text ||
          img?.attr("alt") ||
          "";
        if (link && name.trim()) list.push({ name: name.trim(), link, imageUrl });
      }
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
    const url = `${this.baseUrl}/anime-season/${encodeURIComponent("\u0631\u0628\u064a\u0639-2026")}/`;
    const doc = await this.request(url);
    const list = this.parseAnimeCards(doc);
    const nextPage = doc.selectFirst("a.next.page-numbers") !== null;
    return { list, hasNextPage: nextPage };
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

    const name =
      doc.selectFirst("h1.anime-details-title, h1")?.text || "";

    // Use getSrc for the cover image to handle lazy loading
    const coverImg = doc.selectFirst(
      "img.anime-thumbnail, div.anime-poster img, .series-image img, img[itemprop='image'], div.anime-cover img"
    );
    const imageUrl = coverImg?.getSrc ?? "";

    const description =
      doc.selectFirst("div.anime-story, p.anime-story, .story, .the-content")?.text || "";

    const genreEls = doc.select("div.anime-genres a, .anime-genre a, .genres a");
    const genre = genreEls.map((el) => el.text.trim()).filter(Boolean);

    const statusText =
      doc.selectFirst(".anime-info .status, .anime-status, .status")?.text || "";
    const status = this.parseStatus(statusText);

    // Episodes — primary: episode cards grid
    const episodes = [];
    const epCards = doc.select("#episodesList a, div.ep-card-container a");
    const seen = new Set();
    for (const ep of epCards) {
      const epLink = ep.attr("href") || "";
      if (!epLink || seen.has(epLink)) continue;
      // Only include links that go to /episode/ paths
      if (!epLink.includes("/episode/")) continue;
      seen.add(epLink);
      const epText = ep.text.trim();
      const epNumMatch = epText.match(/(\d+(\.\d+)?)/);
      const num = epNumMatch ? parseFloat(epNumMatch[1]) : episodes.length + 1;
      episodes.push({ name: `\u0627\u0644\u062d\u0644\u0642\u0629 ${num}`, url: epLink, num, scanlator: "\u0645\u062a\u0631\u062c\u0645" });
    }

    // Fallback: sidebar #ULEpisodesList
    if (episodes.length === 0) {
      const epLinks = doc.select("#ULEpisodesList a");
      for (const ep of epLinks) {
        const epLink = ep.attr("href") || "";
        if (!epLink) continue;
        const epText = ep.text.trim();
        const epNumMatch = epText.match(/(\d+(\.\d+)?)/);
        const num = epNumMatch ? parseFloat(epNumMatch[1]) : episodes.length + 1;
        episodes.push({ name: epText, url: epLink, num, scanlator: "\u0645\u062a\u0631\u062c\u0645" });
      }
    }

    return { name: name.trim(), imageUrl, description: description.trim(), genre, status, episodes };
  }

  parseStatus(text) {
    if (!text) return 5;
    const t = text.toLowerCase();
    if (t.includes("\u0645\u0633\u062a\u0645\u0631") || t.includes("ongoing") || t.includes("\u064a\u0639\u0631\u0636")) return 0;
    if (t.includes("\u0645\u0643\u062a\u0645\u0644") || t.includes("completed") || t.includes("\u0645\u0646\u062a\u0647\u064a")) return 1;
    return 5;
  }

  async getVideoList(url) {
    const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url}`;
    const doc = await this.request(fullUrl);
    const videos = [];

    const rows = doc.select("table tr");
    for (const row of rows) {
      const a = row.selectFirst("a");
      if (!a) continue;
      const href = a.attr("href") || "";
      if (!href || href === "#") continue;

      const cells = row.select("td");
      const server = cells.length > 1 ? cells[1].text.trim() : "";
      const quality = cells.length > 2 ? cells[2].text.trim() : "";
      const qualityLabel = `${server} - ${quality}`.replace(/^\s*-\s*/, "").trim();

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
        } else if (
          href.includes("streamruby") ||
          href.includes("dsvplay") ||
          href.includes("megamax")
        ) {
          videos.push({
            url: href,
            originalUrl: href,
            quality: qualityLabel,
            headers: { Referer: this.baseUrl },
          });
        } else if (/\.(mp4|m3u8)(\?|$)/i.test(href)) {
          videos.push({
            url: href,
            originalUrl: href,
            quality: qualityLabel,
            headers: { Referer: this.baseUrl },
          });
        }
      } catch (_) {}
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
          title: "\u0627\u0644\u062c\u0648\u062f\u0629 \u0627\u0644\u0645\u0641\u0636\u0644\u0629",
          summary: "",
          valueIndex: 0,
          entries: ["FHD 1080p", "HD 720p", "SD 480p"],
          entryValues: ["1080", "720", "480"],
        },
      },
    ];
  }
}
