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
  "pkgPath": "anime/src/aanime_ar.js"
}];

class DefaultExtension extends MProvider {
  get baseUrl() {
    return this.source.baseUrl;
  }

  async request(url) {
    const res = await new Client().get(url, this.headers());
    return new Document(res.body);
  }

  headers() {
    return { "Referer": this.baseUrl };
  }

  parseAnimeCards(doc) {
    const list = [];
    const cards = doc.select("div.anime-card-container");
    // ... parsing logic
    return list;
  }

  async function getPopular(page) {
    // URL provided by you: https://witanime.you/%D9%82%D8%A7%D8%A6%D9%85%D8%A9-%D8%A7%D9%84%D8%A3%D9%86%D9%85%D9%8A/page/1/
    // We break down the encoded Arabic path, injecting the dynamic 'page' parameter 
    const url = `https://witanime.you/%D9%82%D8%A7%D8%A6%D9%85%D8%A9-%D8%A7%D9%84%D8%A7%D9%86%D9%85%D9%8A/page/${page}/`;
    
    // Fetch the HTML document from the server
    const response = await client.get(url);
    const html = response.body;

    // Target the main Grid/Container containing the anime entries
    const elements = document.select(html, "div.anime-list-content div.col-lg-2, div.anime-card-container"); 
    const animeList = [];

    for (const element of elements) {
        // Scrape individual attributes safely
        const name = document.selectFirst(element, "h3 a, .anime-title").text;
        const link = document.selectFirst(element, "a").attr("href");
        const image = document.selectFirst(element, "img").attr("src");

        animeList.push({
            name: name.trim(),
            link: link,
            imageUrl: image
        });
    }

    // Return the pagination check and the populated collection array
    return {
        list: animeList,
        hasNextPage: animeList.length > 0 
    };
}

async function getLatest(page) {
    // URL provided by you: https://witanime.you/episode/page/1/
    const url = `https://witanime.you/episode/page/${page}/`;
    
    // Fetch the raw response HTML 
    const response = await client.get(url);
    const html = response.body;

    // Select the grids wrapping latest published episodes
    const elements = document.select(html, "div.episodes-list-content div.col-lg-3, div.episode-card"); 
    const latestList = [];

    for (const element of elements) {
        const name = document.selectFirst(element, "h3 a, .episode-title").text;
        const link = document.selectFirst(element, "a").attr("href");
        const image = document.selectFirst(element, "img").attr("src");

        latestList.push({
            name: name.trim(),
            link: link,
            imageUrl: image
        });
    }

    return {
        list: latestList,
        hasNextPage: latestList.length > 0
    };
}

  async search(query, page, filters) {
    // ... implementation
  }

  async getDetail(url) {
    // ... implementation
  }

  async getVideoList(url) {
    // ... implementation with extractDirectVideo helper
  }

  getFilterList() {
    return [];
  }
}
