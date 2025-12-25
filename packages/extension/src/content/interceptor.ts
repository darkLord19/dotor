
const originalFetch = window.fetch;

window.fetch = async (...args) => {
  const [resource, config] = args;
  const response = await originalFetch(resource, config);

  const url = typeof resource === 'string' ? resource : resource instanceof Request ? resource.url : '';
  
  // Broaden check to capture more messaging related queries
  if (url.includes('voyagerMessagingGraphQL/graphql') && 
     (url.includes('queryId=messengerMessages') || url.includes('messengerMessages'))) {
    const clone = response.clone();
    clone.json().then((data) => {
      window.postMessage({
        type: 'LINKEDIN_MESSAGES_INTERCEPTED',
        data: data
      }, '*');
    }).catch(err => {
      console.error('Error parsing intercepted LinkedIn response', err);
    });
  }

  return response;
};
