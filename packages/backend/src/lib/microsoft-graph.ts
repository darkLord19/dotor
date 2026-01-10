const GRAPH_API = 'https://graph.microsoft.com/v1.0';

export interface OutlookEmail {
  id: string;
  subject: string;
  bodyPreview: string;
  receivedDateTime: string;
  webLink: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    }
  };
  toRecipients: Array<{
    emailAddress: {
      name: string;
      address: string;
    }
  }>;
}

export interface OutlookEvent {
  id: string;
  subject: string;
  bodyPreview: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  webLink: string;
  organizer: {
    emailAddress: {
      name: string;
      address: string;
    }
  };
  location: {
    displayName: string;
  };
}

export async function searchOutlook(accessToken: string, query: string, limit: number = 10): Promise<OutlookEmail[]> {
  // Use $search for newer search or $filter
  // $search="query"
  const params = new URLSearchParams({
    '$search': `"${query}"`,
    '$top': limit.toString(),
    '$select': 'id,subject,bodyPreview,receivedDateTime,webLink,from,toRecipients'
  });

  const response = await fetch(`${GRAPH_API}/me/messages?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Prefer': 'outlook.body-content-type="text"'
    }
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Error searching Outlook:', error);
    throw new Error(`Failed to search Outlook: ${response.statusText}`);
  }

  const data = await response.json();
  return data.value || [];
}

export async function getOutlookEvents(accessToken: string, start: Date, end: Date): Promise<OutlookEvent[]> {
  const params = new URLSearchParams({
    'startDateTime': start.toISOString(),
    'endDateTime': end.toISOString(),
    '$select': 'id,subject,bodyPreview,start,end,webLink,organizer,location',
    '$orderby': 'start/dateTime',
    '$top': '50'
  });

  const response = await fetch(`${GRAPH_API}/me/calendar/calendarView?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Prefer': 'outlook.timezone="UTC"'
    }
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Error fetching Outlook events:', error);
    throw new Error(`Failed to fetch Outlook events: ${response.statusText}`);
  }

  const data = await response.json();
  return data.value || [];
}
