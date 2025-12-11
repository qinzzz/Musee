// Cache for artwork summaries to avoid duplicate requests and enable background loading
type SummaryCache = {
  [artworkId: string]: {
    promise?: Promise<any>;
    data?: string; // The summary text
    error?: any;
  };
};

const cache: SummaryCache = {};

export const artworkSummaryCache = {
  get: (artworkId: string) => cache[artworkId],

  set: (artworkId: string, promise: Promise<any>) => {
    cache[artworkId] = { promise };

    promise
      .then(data => {
        if (cache[artworkId]) {
          cache[artworkId].data = data.summary; // Extract summary from response
          cache[artworkId].promise = undefined;
        }
      })
      .catch(error => {
        if (cache[artworkId]) {
          cache[artworkId].error = error;
          cache[artworkId].promise = undefined;
        }
      });
  },

  clear: (artworkId: string) => {
    delete cache[artworkId];
  },

  clearAll: () => {
    Object.keys(cache).forEach(key => delete cache[key]);
  },
};
