// Anime4Up Mangayomi Extension v0.1.5
// Arabic anime streaming with direct video extraction

const baseUrl = "https://w1.anime4up.rest";
const client = new Client();

// Helper: Extract direct video URL from embed
async function extractDirectVideo(embedUrl) {
  try {
    // Fetch embed page HTML
    const response = await client.get(embedUrl, { "Referer": baseUrl });
    const html = response.body;
    
    // MoonGetter-inspired patterns for direct video extraction
    const patterns = [
      // Mp4Upload pattern: src:"<url>"
      /src\s*:\s*"([^"]+\.mp4[^"]*)"/,
      /file\s*:\s*"([^"]+\.mp4[^"]*)"/,
      // VOE pattern
      /'hls'\s*:\s*'([^']+\.m3u8[^']*)'/,
      /sources\s*:\s*\[\s*{\s*file\s*:\s*"([^"]+)"/,
      // Streamtape pattern
      /getElementById\('robotlink'\)\.innerHTML\s*=\s*'([^']+)'/,
      // Generic mp4/m3u8 in quotes
      /"(https?:\/\/[^"]+\.(mp4|m3u8)[^"]*)"/,
      /'(https?:\/\/[^']+\.(mp4|m3u8)[^']*)'/
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        let videoUrl = match[1];
        
        // Validate URL starts with http
        if (videoUrl.startsWith('http')) {
          return videoUrl;
        }
        // Handle relative URLs for streamtape
        if (videoUrl.startsWith('//')) {
          return 'https:' + videoUrl;
        }
      }
    }
    
    // Fallback: return embed URL if extraction fails
    return embedUrl;
  } catch (e) {
    return embedUrl; // Return embed URL on error
  }
}

// Get popular anime list
function getPopularAnime(page) {
  const url = `${baseUrl}/home8/page/${page}`;
  const response = client.get(url, { "Referer": baseUrl });
  const doc = new Document(response.body);
  
  const animeList = [];
  const items = doc.select("ul.Indexul li");
  
  items.forEach(item => {
    const link = item.selectFirst("a");
    const img = item.selectFirst("img");
    
    if (link && img) {
      animeList.push({
        name: link.text().trim() || img.attr("alt") || "Unknown",
        link: link.attr("href"),
        imageUrl: img.attr("src") || img.attr("data-src") || ""
      });
    }
  });
  
  return JSON.stringify(animeList);
}

// Get latest updates
function getLatestUpdates(page) {
  const url = `${baseUrl}/home8/page/${page}`;
  const response = client.get(url, { "Referer": baseUrl });
  const doc = new Document(response.body);
  
  const updates = [];
  const sections = doc.select("div.col-md-6.col-lg-4");
  
  sections.forEach(section => {
    const heading = section.selectFirst("h3");
    if (!heading) return;
    
    const link = heading.selectFirst("a");
    if (!link) return;
    
    const animeTitle = link.text().trim();
    const animeUrl = link.attr("href");
    
    const episodes = section.select("ul.Indexul2 li a");
    episodes.forEach(ep => {
      updates.push({
        name: `${animeTitle} - ${ep.text().trim()}`,
        link: ep.attr("href"),
        imageUrl: ""
      });
    });
  });
  
  return JSON.stringify(updates);
}

// Search anime
function search(query, page) {
  const url = `${baseUrl}/?search_param=anime&s=${encodeURIComponent(query)}`;
  const response = client.get(url, { "Referer": baseUrl });
  const doc = new Document(response.body);
  
  const results = [];
  const items = doc.select("div.hover0 a");
  
  items.forEach(item => {
    const img = item.selectFirst("img");
    const title = item.selectFirst("div.ImgOverlay1");
    
    if (img && title) {
      results.push({
        name: title.text().trim() || img.attr("alt") || "Unknown",
        link: item.attr("href"),
        imageUrl: img.attr("src") || img.attr("data-src") || ""
      });
    }
  });
  
  return JSON.stringify(results);
}

// Get anime detail
function getDetail(url) {
  const response = client.get(url, { "Referer": baseUrl });
  const doc = new Document(response.body);
  
  const title = doc.selectFirst("h1.anime-details-title")?.text().trim() || "Unknown";
  const desc = doc.selectFirst("div.anime-details-description, p.story")?.text().trim() || "No description";
  const img = doc.selectFirst("img.anime-details-img, div.RightBox img");
  const imageUrl = img ? (img.attr("src") || img.attr("data-src") || "") : "";
  
  const episodes = [];
  const epList = doc.select("ul.Indexul li a, div.Episodes--Mainbody a");
  
  epList.forEach(ep => {
    episodes.push({
      name: ep.text().trim(),
      url: ep.attr("href")
    });
  });
  
  return JSON.stringify({
    name: title,
    imageUrl: imageUrl,
    description: desc,
    episodes: episodes
  });
}

// Get episode videos with direct extraction
async function getVideoList(episodeUrl) {
  const response = await client.get(episodeUrl, { "Referer": baseUrl });
  const doc = new Document(response.body);
  
  const videos = [];
  const serverRows = doc.select("tr");
  
  for (const row of serverRows) {
    const cells = row.select("td");
    if (cells.length < 2) continue;
    
    const serverName = cells[0].text().trim();
    const link = cells[1].selectFirst("a");
    
    if (!link) continue;
    
    const embedUrl = link.attr("href");
    if (!embedUrl || embedUrl === "#") continue;
    
    // Extract direct video URL
    const directUrl = await extractDirectVideo(embedUrl);
    
    videos.push({
      url: directUrl,
      originalUrl: embedUrl,
      quality: serverName,
      headers: { "Referer": baseUrl }
    });
  }
  
  return JSON.stringify({ videos: videos });
}

// Get image with proper headers
function getImageUrl(imageUrl) {
  // Try multiple patterns for lazy-loaded images
  const patterns = [
    imageUrl,
    imageUrl.replace("-150x150", ""),
    imageUrl.replace("-300x169", ""),
    imageUrl.replace(/\/resize\/\d+,\d+\//, "/")
  ];
  
  for (const url of patterns) {
    if (url && url.startsWith("http")) {
      return url;
    }
  }
  
  return imageUrl;
}
