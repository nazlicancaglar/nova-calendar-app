const google = require('googlethis');

async function search() {
  const query = process.argv[2];
  if (!query) {
    console.error("Please provide a search query.");
    process.exit(1);
  }

  try {
    const options = {
      page: 0,
      safe: false,
      additional_params: {
        hl: 'en'
      }
    };
    
    const response = await google.search(query, options);
    
    const results = response.results.slice(0, 5).map(r => ({
      title: r.title,
      description: r.description,
      url: r.url
    }));

    console.log(JSON.stringify({
      results: results,
      knowledge_panel: response.knowledge_panel.title ? response.knowledge_panel : undefined
    }, null, 2));
  } catch (error) {
    console.error("Search failed:", error.message);
    process.exit(1);
  }
}

search();
