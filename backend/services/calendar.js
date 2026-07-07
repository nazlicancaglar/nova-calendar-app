const axios = require('axios');
const ical = require('ical');

async function fetchCalendarEventsFromUrl(url, calendarName) {
  if (!url || url.includes('your_') || !url.startsWith('http')) {
    console.log(`${calendarName} URL not configured.`);
    return [];
  }

  try {
    const response = await axios.get(url);
    const data = ical.parseICS(response.data);
    const eventsList = [];
    const today = new Date();
    
    // Define window: ±90 days around today
    const minDate = new Date(today);
    minDate.setDate(today.getDate() - 90);
    const maxDate = new Date(today);
    maxDate.setDate(today.getDate() + 90);

    for (let k in data) {
      if (data.hasOwnProperty(k)) {
        const ev = data[k];
        if (ev.type === 'VEVENT') {
          const startDate = new Date(ev.start);
          
          // Filter to the ±90 days window
          if (startDate >= minDate && startDate <= maxDate) {
            // Format time nicely
            let timeStr = 'All Day';
            if (ev.start && ev.end) {
              const startHours = startDate.getHours();
              const startMinutes = startDate.getMinutes().toString().padStart(2, '0');
              const ampm = startHours >= 12 ? 'PM' : 'AM';
              const hour12 = startHours % 12 || 12;
              
              const endDate = new Date(ev.end);
              const endHours = endDate.getHours();
              const endMinutes = endDate.getMinutes().toString().padStart(2, '0');
              const endAmpm = endHours >= 12 ? 'PM' : 'AM';
              const endHour12 = endHours % 12 || 12;

              if (startDate.getHours() === 0 && startDate.getMinutes() === 0 && endDate.getHours() === 23) {
                timeStr = 'All Day';
              } else {
                timeStr = `${hour12}:${startMinutes} ${ampm} - ${endHour12}:${endMinutes} ${endAmpm}`;
              }
            }

            // Local date calculation: YYYY-MM-DD
            const y = startDate.getFullYear();
            const m = (startDate.getMonth() + 1).toString().padStart(2, '0');
            const d = startDate.getDate().toString().padStart(2, '0');
            const dateStr = `${y}-${m}-${d}`;

            eventsList.push({
              date: dateStr,
              time: timeStr,
              title: ev.summary || 'Untitled Event',
              details: ev.description ? ev.description.substring(0, 100) : 'No details available.',
              source: calendarName
            });
          }
        }
      }
    }
    return eventsList;
  } catch (error) {
    console.error(`Error parsing calendar from ${calendarName}:`, error.message);
    return [];
  }
}

async function fetchAllCalendarEvents() {
  const googleUrl = process.env.GOOGLE_CALENDAR_ICS_URL;
  const outlookUrl = process.env.OUTLOOK_CALENDAR_ICS_URL;

  const googleValid = googleUrl && googleUrl.startsWith('http') && !googleUrl.includes('your_');
  const outlookValid = outlookUrl && outlookUrl.startsWith('http') && !outlookUrl.includes('your_');

  if (!googleValid && !outlookValid) {
    return null; // Return null to fallback to mock data
  }

  const [googleEvents, outlookEvents] = await Promise.all([
    fetchCalendarEventsFromUrl(googleUrl, 'Google Calendar'),
    fetchCalendarEventsFromUrl(outlookUrl, 'Outlook Calendar')
  ]);

  const allEvents = [...(googleEvents || []), ...(outlookEvents || [])];
  
  // Return all events sorted (date first, then all-day, then by time)
  return allEvents.sort((a, b) => {
    const dateComp = a.date.localeCompare(b.date);
    if (dateComp !== 0) return dateComp;
    if (a.time === 'All Day') return -1;
    if (b.time === 'All Day') return 1;
    return a.time.localeCompare(b.time);
  });
}

module.exports = { fetchAllCalendarEvents };

