// Simple cache for artist analysis to avoid duplicate requests
type AnalysisCache = {
  [photoUri: string]: {
    promise?: Promise<any>;
    data?: any;
    error?: any;
  };
};

const cache: AnalysisCache = {};

export const artistAnalysisCache = {
  get: (photoUri: string) => cache[photoUri],

  set: (photoUri: string, promise: Promise<any>) => {
    cache[photoUri] = { promise };

    promise
      .then(data => {
        if (cache[photoUri]) {
          cache[photoUri].data = data;
          cache[photoUri].promise = undefined;
        }
      })
      .catch(error => {
        if (cache[photoUri]) {
          cache[photoUri].error = error;
          cache[photoUri].promise = undefined;
        }
      });
  },

  clear: (photoUri: string) => {
    delete cache[photoUri];
  },
};
