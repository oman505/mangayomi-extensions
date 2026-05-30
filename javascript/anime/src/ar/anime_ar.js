const mangayomiSources = [{
  "name": "anime_ar",
  "lang": "ar",
  "baseUrl": "https://witanime.you",
  "apiUrl": "",
  "iconUrl": "https://witanime.you/wp-content/uploads/2022/01/WITLOGO.png",
  "typeSource": "single",
  "itemType": 1,
  "isMFn": false,
  "version": "0.1.5",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "anime/src/ar/anime_ar.js"
}];

class DefaultExtension extends MProvider {
  get baseUrl() {
    return this.source.baseUrl;
  }

  async request(url) {
    const fullUrl = this.absoluteUrl(url);
    const res = await new Client().get(fullUrl, this.headers());
    return new Document(res.body);
  }

  headers() {
    return {
      "Referer": this.baseUrl + "/",
      "Origin": this.baseUrl,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    };
  }

  absoluteUrl(url) {
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    if (url.startsWith("//")) return `https:${url}`;
    if (url.startsWith("/")) return `${this.baseUrl}${url}`;
    return `${this.baseUrl}/${url}`;
  }

  normalizeLink(url) {
    const full = this.absoluteUrl(url);
    return full.replace(this.baseUrl, "");
  }

  parseAnimeCards(doc, options = {}) {
    const { allowEpisodes = false } = options;
    const list = [];
    const seen = new Set();

    const selectors = [
      "div.anime-card-container",
      "div.col-lg-2",
      "div.col-md-3",
      "div.col-sm-3",
      "article",
      ".anime-card"
    ];

    let cards = [];
    for (const selector of selectors) {
      const found = doc.select(selector);
      if (found && found.length > 0) {
        cards = found;
        break;
      }
    }

    for (const card of cards) {
      const anchor =
        card.selectFirst('a[href*="/anime/"]') ||
        card.selectFirst("div.anime-card-title a") ||
        card.selectFirst("h3 a") ||
        card.selectFirst("a");

      if (!anchor) continue;

      const rawHref = anchor.attr("href") || "";
      if (!rawHref) continue;
      const href = this.absoluteUrl(rawHref);
      
      if (!allowEpisodes && href.includes("/episode/")) continue;
      if (seen.has(href)) continue;

      const img = card.selectFirst("img") || anchor.selectFirst("img");

      const title =
        anchor.attr("title") ||
        (img ? img.attr("alt") : "") ||
        (card.selectFirst(".anime-card-title") ? card.selectFirst(".anime-card-title").text : "") ||
        (card.selectFirst("h3") ? card.selectFirst("h3").text : "") ||
        anchor.text;

      const imageUrl = img
        ? (
            img.attr("data-src") ||
            img.attr("data-lazy-src") ||
            img.attr("src") ||
            ""
          )
        : "";

      if (!title || title.trim() === "") continue;

      seen.add(href);
      list.push({
        name: title.trim(),
        imageUrl: this.absoluteUrl((imageUrl || "").trim()),
        link: this.normalizeLink(href)
      });
    }

    return list;
  }

  async getPopular(page) {
    const path = page === 1
      ? "/%d9%82%d8%a7%d8%a6%d9%85%d8%a9-%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a/"
      : `/%d9%82%d8%a7%d8%a6%d9%85%d8%a9-%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a/page/${page}/`;

    const doc = await this.request(path);
    const list = this.parseAnimeCards(doc, { allowEpisodes: false });

    const hasNextPage =
      doc.selectFirst(`a[href*="/page/${page + 1}/"]`) != null ||
      list.length > 0;

    return {
      list,
      hasNextPage
    };
  }

  async getLatestUpdates(page) {
    const path = page === 1 ? "/episode/" : `/episode/page/${page}/`;
    const doc = await this.request(path);
    
    const list = [];
    const seen = new Set();
    
    const containers = doc.select("div.anime-card-container");
    
    if (containers && containers.length > 0) {
      // Pull items using root selections to strictly avoid element loop crashes
      const allAnchors = doc.select("div.anime-card-container a");
      const posters = doc.select("div.anime-card-container div.anime-card-poster img, div.anime-card-container img");

      for (let i = 0; i < containers.length; i++) {
        let finalLink = "";
        let title = "";

        // First choice: check if there's a direct anime link inside the card wrapper
        const blockHtml = containers[i] ? (containers[i].outerHtml || "") : "";
        const animeMatch = blockHtml.match(/href=["']([^"']*(?:\/anime\/)[^"']*)["']/i);
        
        if (animeMatch && animeMatch[1]) {
          finalLink = animeMatch[1];
        } else if (allAnchors && allAnchors[i]) {
          // 404 Prevention Fix: Pass the 100% valid episode link directly instead of regex slicing it
          finalLink = allAnchors[i].attr("href") || "";
        }

        if (!finalLink) continue;

        const normalizedLink = this.normalizeLink(this.absoluteUrl(finalLink));
        if (seen.has(normalizedLink)) continue;
        seen.add(normalizedLink);

        const titleMatch = blockHtml.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i) || blockHtml.match(/title=["']([^"']+)["']/i);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1].replace(/<[^>]*>/g, "").trim();
        }

        let imageUrl = "";
        if (posters && posters[i]) {
          const img = posters[i];
          imageUrl = img.attr("data-src") || img.attr("data-lazy-src") || img.attr("src") || "";
          if (!title) title = img.attr("alt") || "";
        }

        if (!title) title = "أنمي جديد";

        list.push({
          name: title,
          imageUrl: this.absoluteUrl((imageUrl || "").trim()) || this.source.iconUrl,
          link: normalizedLink
        });
      }
    }

    const hasNextPage = 
      doc.selectFirst(`a[href*="/page/${page + 1}/"]`) != null || 
      list.length >= 10;

    return {
      list,
      hasNextPage
    };
  }

  async search(query, page, filters) {
    const path = `/?search_param=animes&s=${encodeURIComponent(query)}`;
    const doc = await this.request(path);
    const list = this.parseAnimeCards(doc, { allowEpisodes: false });

    return {
      list,
      hasNextPage: false
    };
  }

  parseStatus(text) {
    if (!text) return 0;

    const s = String(text);
    if (s.indexOf("مكتمل") !== -1 || s.indexOf("completed") !== -1) return 1;
    if (s.indexOf("يعرض") !== -1 || s.indexOf("مستمر") !== -1 || s.indexOf("ongoing") !== -1) return 2;

    return 0;
  }

  async getDetail(url) {
    let fullUrl = this.absoluteUrl(url);
    let res = await new Client().get(fullUrl, this.headers());
    let html = res.body || "";
    let doc = new Document(html);
    
    // Core 404 Protection: If the link is an episode path, parse the server's official link back to the main anime profile
    if (fullUrl.includes("/episode/")) {
      const parentAnimeAnchor = doc.selectFirst("span.anime-page-link a") || 
                                 doc.selectFirst(".anime-page-link a") || 
                                 doc.selectFirst('a[href*="/anime/"]');
      if (parentAnimeAnchor) {
        const foundUrl = parentAnimeAnchor.attr("href") || "";
        if (foundUrl && foundUrl.includes("/anime/")) {
          fullUrl = this.absoluteUrl(foundUrl);
          res = await new Client().get(fullUrl, this.headers());
          html = res.body || "";
          doc = new Document(html);
        }
      }
    }

    const titleNode = doc.selectFirst("h1.anime-details-title") || doc.selectFirst("h1");
    const storyNode = doc.selectFirst(".anime-story");
    const imageNode = doc.selectFirst("div.anime-info-right img") || doc.selectFirst(".anime-thumbnail img") || doc.selectFirst("img");
    
    const title = titleNode && titleNode.text ? titleNode.text.trim() : "";
    const description = storyNode && storyNode.text ? storyNode.text.trim() : "";
    
    let imageUrl = "";
    if (imageNode) {
      imageUrl = imageNode.attr("src") || imageNode.attr("data-src") || imageNode.attr("data-lazy-src") || "";
      if (imageUrl && !imageUrl.startsWith("http")) {
        imageUrl = this.absoluteUrl(imageUrl);
      }
    }
    if (!imageUrl) imageUrl = this.source.iconUrl;

    let rawStatus = "";
    const infoNodes = doc.select("div.anime-info-left div.row div.col-md-6");
    const infoLength = infoNodes ? infoNodes.length : 0;

    for (let i = 0; i < infoLength; i++) {
      const node = infoNodes[i];
      const text = node && node.text ? node.text.trim() : "";
      if (text && text.indexOf("حالة الأنمي") !== -1) {
        rawStatus = text;
        break;
      }
    }

    const status = this.parseStatus(rawStatus);

    const genre = [];
    const genreNodes = doc.select("ul.anime-genres a");
    const genreLength = genreNodes ? genreNodes.length : 0;
    for (let i = 0; i < genreLength; i++) {
      const node = genreNodes[i];
      const text = node && node.text ? node.text.trim() : "";
      if (text && genre.indexOf(text) === -1) {
        genre.push(text);
      }
    }

    const chapters = [];
    const seen = new Set();
    const animePath = this.normalizeLink(fullUrl);
    const slug = animePath.replace(/^\/anime\//, "").replace(/\/$/, "");

    const episodeLinks = doc.select("div.episodes-list-content a, div.div-episodes-list a, a[href*='/episode/']");
    
    if (episodeLinks && episodeLinks.length > 0) {
      let idx = 1;
      for (const linkNode of episodeLinks) {
        const href = linkNode.attr("href") || "";
        if (!href || !href.includes("/episode/")) continue;
        
        const absoluteEpUrl = this.absoluteUrl(href);
        if (seen.has(absoluteEpUrl)) continue;
        seen.add(absoluteEpUrl);

        const name = linkNode.text ? linkNode.text.trim() : `الحلقة ${idx}`;
        const numMatch = name.match(/(\d+(?:\.\d+)?)/);
        const num = numMatch ? parseFloat(numMatch[1]) : idx;

        chapters.push({
          name: name,
          url: absoluteEpUrl,
          num: num,
          scanlator: ""
        });
        idx++;
      }
    }

    if (chapters.length === 0) {
      let episodeCount = 0;
      const countMatch = html.match(/عدد الحلقات:\s*<\/[^>]*>\s*([^<\n\r]+)/);

      if (countMatch && countMatch[1]) {
        const n = countMatch[1].match(/(\d+)/);
        if (n) episodeCount = parseInt(n[1], 10);
      }

      if (!episodeCount) {
        const m = html.match(/عدد الحلقات[^0-9]*(\d+)/);
        if (m) episodeCount = parseInt(m[1], 10);
      }

      for (let i = 1; i <= episodeCount; i++) {
        const epUrl = this.absoluteUrl(`/episode/${slug}-%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9-${i}/`);
        if (seen.has(epUrl)) continue;
        seen.add(epUrl);

        chapters.push({
          name: "الحلقة " + i,
          url: epUrl,
          num: i,
          scanlator: ""
        });
      }
    }

    return {
      name: title,
      imageUrl: imageUrl,
      description: description,
      genre: genre,
      status: status,
      chapters: chapters.reverse()
    };
  }

  async getVideoList(url) {
    return [];
  }

  getFilterList() {
    return [];
  }
}
