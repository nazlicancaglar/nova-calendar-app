const axios = require('axios');

async function fetchNotionTasks() {
  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!apiKey || !databaseId || apiKey.includes('your_notion') || databaseId.includes('your_notion')) {
    console.log('Notion API keys not configured. Falling back to default tasks.');
    return null;
  }

  try {
    const response = await axios.post(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {
        filter: {
          or: [
            {
              property: "Status",
              status: {
                equals: "In progress"
              }
            },
            {
              property: "Date",
              date: {
                equals: new Date().toISOString().split('T')[0]
              }
            }
          ]
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      }
    );

    const tasks = response.data.results.map(page => {
      // Extract task name
      let text = "Untitled Task";
      const titleProperty = page.properties.Name || page.properties.Title || Object.values(page.properties).find(p => p.type === 'title');
      if (titleProperty && titleProperty.title && titleProperty.title.length > 0) {
        text = titleProperty.title.map(t => t.plain_text).join('');
      }

      // Extract priority
      let priority = "MED";
      const priorityProperty = page.properties.Priority;
      if (priorityProperty && priorityProperty.select && priorityProperty.select.name) {
        priority = priorityProperty.select.name.toUpperCase();
      }

      // Extract status / checked state
      let checked = false;
      const statusProperty = page.properties.Status || page.properties.Done || page.properties.Checkbox;
      if (statusProperty) {
        if (statusProperty.type === 'status' && statusProperty.status && statusProperty.status.name === 'Done') {
          checked = true;
        } else if (statusProperty.type === 'checkbox') {
          checked = statusProperty.checkbox;
        }
      }

      return {
        id: page.id,
        text: text,
        checked: checked,
        priority: priority
      };
    });

    return tasks;
  } catch (error) {
    console.error('Error fetching Notion tasks:', error.message);
    return null;
  }
}

module.exports = { fetchNotionTasks };
