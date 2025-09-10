importScripts('https://unpkg.com/comlink/dist/umd/comlink.min.js');

const browserService = {
  async render(url) {
    console.log('Worker: Initializing browser rendering for', url);
    try {
      // Simulate browser rendering with a fetch request
      // In a real setup, this would use Cloudflare's Browser Rendering API or Puppeteer
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'MinimalIDE/1.0',
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      const text = await response.text();
      console.log('Worker: Fetched content successfully');
      
      // Simulate processing (e.g., extracting title)
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      const title = doc.querySelector('title')?.textContent || 'No title found';
      
      // Return result
      return `Rendered ${url}\nTitle: ${title}\nContent length: ${text.length} characters`;
    } catch (error) {
      console.error('Worker: Failed to render', error);
      throw new Error(`Failed to render ${url}: ${error.message}`);
    } finally {
      // Simulate closing browser (no-op for fetch, but included for compatibility)
      console.log('Worker: Closing browser');
    }
  },
};

Comlink.expose(browserService);